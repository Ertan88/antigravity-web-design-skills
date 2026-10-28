import { academicYearLabel, academicYearOf, validateAcademicCalendar, zonedParts, type AcademicCalendarData } from '@okulpano/shared';
import { asc, eq, gte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessUser, schoolGuard } from '../context.ts';
import { academicCalendars } from '../db/schema.ts';
import { badRequest, forbidden, notFound, parse } from '../lib/errors.ts';
import { scanMebCalendar } from '../lib/mebCalendar.ts';

const isoDate = z.iso.date();
const calendarSchema = z.object({
  lessonsStart: isoDate,
  term1End: isoDate,
  term2Start: isoDate,
  lessonsEnd: isoDate,
  breaks: z.array(z.object({ name: z.string().trim().min(2).max(80), start: isoDate, end: isoDate })).max(6),
});

type Row = typeof academicCalendars.$inferSelect;
const view = (r: Row) => ({
  startYear: r.startYear,
  label: academicYearLabel(r.startYear),
  data: r.data,
  source: r.source,
  sourceUrl: r.sourceUrl,
  status: r.status,
  pending: r.pending,
  checkedAt: r.checkedAt?.toISOString() ?? null,
  updatedAt: r.updatedAt.toISOString(),
});

/**
 * MEB eğitim ve öğretim yılı çalışma takvimi. Okullar içinde bulunulan ve gelecek eğitim yılını görür; platform
 * yöneticisi taramayı elle başlatır, farkları onaylar ya da tarihleri elle düzeltir.
 */
export async function academicCalendarRoutes(app: FastifyInstance) {
  const { db } = app.deps;
  const platform = {
    preHandler: [
      app.authenticate,
      async (req: Parameters<typeof app.authenticate>[0]) => {
        if (!accessUser(req).sa) throw forbidden();
      },
    ],
  };
  const yearParam = (req: { params: unknown }) => {
    const y = Number((req.params as { year: string }).year);
    if (!Number.isInteger(y) || y < 2020 || y > 2100) throw notFound();
    return y;
  };

  /** Okul: bu ve gelecek eğitim yılının takvimi (tatil günleriyle) */
  app.get('/api/schools/:schoolId/academic-calendar', { preHandler: [app.authenticate, schoolGuard()] }, async (req) => {
    const current = academicYearOf(zonedParts(new Date(), req.ctx.school.timezone).isoDate);
    const rows = await db.select().from(academicCalendars).where(gte(academicCalendars.startYear, current)).orderBy(asc(academicCalendars.startYear)).limit(2);
    return {
      currentYear: current,
      follow: req.ctx.school.settings?.followMebCalendar !== false,
      years: rows.map((r) => ({ startYear: r.startYear, label: academicYearLabel(r.startYear), data: r.data, source: r.source, status: r.status })),
    };
  });

  app.get('/api/platform/academic-calendars', platform, async () => {
    const rows = await db.select().from(academicCalendars).orderBy(asc(academicCalendars.startYear));
    return rows.map(view);
  });

  /** Şimdi tara: MEB'in sitesinde ya da verilen duyuru adresinde */
  app.post('/api/platform/academic-calendars/:year/scan', platform, async (req) => {
    const year = yearParam(req);
    const { url } = parse(z.object({ url: z.url().optional() }), req.body ?? {});
    return scanMebCalendar(app.deps, year, { url });
  });

  /** Elle gir / düzelt: platform yöneticisinin girdiği takvim taramayla değişmez */
  app.put('/api/platform/academic-calendars/:year', platform, async (req) => {
    const year = yearParam(req);
    const data = parse(calendarSchema, req.body) as AcademicCalendarData;
    const problem = validateAcademicCalendar(data, year);
    if (problem) throw badRequest(problem);
    const [row] = await db
      .insert(academicCalendars)
      .values({ startYear: year, data, source: 'manual', status: 'confirmed', pending: null })
      .onConflictDoUpdate({ target: academicCalendars.startYear, set: { data, source: 'manual', status: 'confirmed', pending: null } })
      .returning();
    return view(row!);
  });

  /** Onayla: bekleyen (taranan) takvim uygulanır ya da mevcut takvim olduğu gibi onaylanır */
  app.post('/api/platform/academic-calendars/:year/accept', platform, async (req) => {
    const year = yearParam(req);
    const [row] = await db.select().from(academicCalendars).where(eq(academicCalendars.startYear, year));
    if (!row) throw notFound();
    const set = row.pending
      ? { data: row.pending.data, sourceUrl: row.pending.sourceUrl, source: 'meb' as const, status: 'confirmed' as const, pending: null }
      : { status: 'confirmed' as const };
    const [saved] = await db.update(academicCalendars).set(set).where(eq(academicCalendars.startYear, year)).returning();
    return view(saved!);
  });

  /** Bekleyen farkı reddet: mevcut takvim kalır */
  app.post('/api/platform/academic-calendars/:year/reject', platform, async (req) => {
    const year = yearParam(req);
    const [saved] = await db.update(academicCalendars).set({ pending: null, status: 'confirmed' }).where(eq(academicCalendars.startYear, year)).returning();
    if (!saved) throw notFound();
    return view(saved);
  });
}

