import { transportAutoSchema, transportDaySchema } from '@okulpano/shared';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { audit, schoolGuard } from '../context.ts';
import { duties, teacherLeaves, teachers, transportDuties } from '../db/schema.ts';
import { badRequest, parse } from '../lib/errors.ts';
import { trDate } from '../lib/sheets/duties.ts';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** Ayın tüm günleri (YYYY-AA-GG) ve hafta günleri (1 = Pazartesi) */
function monthDays(month: string): { date: string; weekday: number }[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => ({
    date: `${month}-${pad(i + 1)}`,
    weekday: ((new Date(Date.UTC(y, m - 1, i + 1)).getUTCDay() + 6) % 7) + 1,
  }));
}

/**
 * Taşımalı öğrenci görevlileri: servisten indirme, öğle yemeği dağıtımı ve servise bindirme için
 * o günün nöbetçileri arasından görevlendirilen öğretmenler. Tarih bazlıdır; otomatik dağıtım
 * nöbetçiler arasında görev sayısını eşitler ve izinli öğretmeni atlar.
 */
export async function transportRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const base = '/api/schools/:schoolId/transport-duties';
  const read = { preHandler: [app.authenticate, schoolGuard()] };
  const write = { preHandler: [app.authenticate, schoolGuard('duties.manage')] };

  async function monthRows(schoolId: string, month: string) {
    const days = monthDays(month);
    return db
      .select({ date: transportDuties.date, teacherId: transportDuties.teacherId, sortOrder: transportDuties.sortOrder, teacherName: teachers.fullName })
      .from(transportDuties)
      .innerJoin(teachers, eq(teachers.id, transportDuties.teacherId))
      .where(and(eq(transportDuties.schoolId, schoolId), gte(transportDuties.date, days[0]!.date), lte(transportDuties.date, days[days.length - 1]!.date)))
      .orderBy(asc(transportDuties.date), asc(transportDuties.sortOrder));
  }

  /** ?month=YYYY-AA → [{ date, teachers: [{ id, fullName }] }] */
  app.get(base, read, async (req) => {
    const { month } = req.query as { month?: string };
    if (!month || !MONTH_RE.test(month)) throw badRequest('Ay YYYY-AA biçiminde olmalı.');
    const rows = await monthRows(req.ctx.schoolId, month);
    const byDate = new Map<string, { id: string; fullName: string }[]>();
    for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), { id: r.teacherId, fullName: r.teacherName }]);
    return [...byDate].map(([date, list]) => ({ date, teachers: list }));
  });

  /** Bir günün görevlilerini değiştirir (boş liste: görevlendirme kaldırılır) */
  app.put(`${base}/:date`, write, async (req) => {
    const { date } = req.params as { date: string };
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw badRequest('Tarih YYYY-AA-GG biçiminde olmalı.');
    const body = parse(transportDaySchema, req.body);
    const ids = [...new Set(body.teacherIds)];
    const schoolId = req.ctx.schoolId;
    if (ids.length) {
      const found = await db
        .select({ id: teachers.id })
        .from(teachers)
        .where(and(eq(teachers.schoolId, schoolId), inArray(teachers.id, ids)));
      if (found.length !== ids.length) throw badRequest('Öğretmen bulunamadı.');
    }
    await db.transaction(async (tx) => {
      await tx.delete(transportDuties).where(and(eq(transportDuties.schoolId, schoolId), eq(transportDuties.date, date)));
      if (ids.length) await tx.insert(transportDuties).values(ids.map((teacherId, i) => ({ schoolId, date, teacherId, sortOrder: i })));
    });
    await audit(req, 'update', 'Taşımalı öğrenci görevlisi', null, `${trDate(date)} · ${ids.length} görevli`);
    bus.contentChanged(schoolId);
    return { date, count: ids.length };
  });

  /** Ay boyunca o günün nöbetçilerinden dönüşümlü görevli atar */
  app.post(`${base}/auto`, write, async (req) => {
    const body = parse(transportAutoSchema, req.body);
    const schoolId = req.ctx.schoolId;
    const days = monthDays(body.month);
    const first = days[0]!.date;
    const last = days[days.length - 1]!.date;

    const [dutyRows, existing, leaves] = await Promise.all([
      db
        .select({ weekday: duties.weekday, teacherId: duties.teacherId })
        .from(duties)
        .innerJoin(teachers, eq(teachers.id, duties.teacherId))
        .where(and(eq(duties.schoolId, schoolId), eq(teachers.isActive, true)))
        .orderBy(asc(duties.weekday), asc(duties.sortOrder), asc(duties.area)),
      monthRows(schoolId, body.month),
      db
        .select({ teacherId: teacherLeaves.teacherId, startDate: teacherLeaves.startDate, endDate: teacherLeaves.endDate })
        .from(teacherLeaves)
        .where(and(eq(teacherLeaves.schoolId, schoolId), lte(teacherLeaves.startDate, last), gte(teacherLeaves.endDate, first))),
    ]);
    const pool = new Map<number, string[]>();
    for (const d of dutyRows) {
      const list = pool.get(d.weekday) ?? [];
      if (!list.includes(d.teacherId)) list.push(d.teacherId);
      pool.set(d.weekday, list);
    }
    const filled = new Set(existing.map((r) => r.date));
    const count = new Map<string, number>();
    const lastDate = new Map<string, string>();
    if (!body.overwrite) {
      for (const r of existing) {
        count.set(r.teacherId, (count.get(r.teacherId) ?? 0) + 1);
        lastDate.set(r.teacherId, r.date);
      }
    }
    const onLeave = (teacherId: string, date: string) => leaves.some((l) => l.teacherId === teacherId && l.startDate <= date && l.endDate >= date);

    const plan: { date: string; teacherIds: string[] }[] = [];
    let skipped = 0;
    for (const day of days) {
      const candidates = pool.get(day.weekday);
      if (!candidates?.length) continue;
      if (!body.overwrite && filled.has(day.date)) continue;
      const available = candidates.filter((t) => !onLeave(t, day.date));
      if (!available.length) {
        skipped++;
        continue;
      }
      // Az görev alan önce; eşitse en uzun süredir görev almayan; o da eşitse nöbet sırası
      const picked = [...available]
        .sort(
          (a, b) =>
            (count.get(a) ?? 0) - (count.get(b) ?? 0) ||
            (lastDate.get(a) ?? '').localeCompare(lastDate.get(b) ?? '') ||
            available.indexOf(a) - available.indexOf(b),
        )
        .slice(0, body.perDay);
      for (const t of picked) {
        count.set(t, (count.get(t) ?? 0) + 1);
        lastDate.set(t, day.date);
      }
      plan.push({ date: day.date, teacherIds: picked });
    }

    await db.transaction(async (tx) => {
      if (body.overwrite) {
        await tx.delete(transportDuties).where(and(eq(transportDuties.schoolId, schoolId), gte(transportDuties.date, first), lte(transportDuties.date, last)));
      }
      const values = plan.flatMap((p) => p.teacherIds.map((teacherId, i) => ({ schoolId, date: p.date, teacherId, sortOrder: i })));
      if (values.length) await tx.insert(transportDuties).values(values).onConflictDoNothing();
    });
    await audit(req, 'update', 'Taşımalı öğrenci görevlisi', null, `${body.month} otomatik dağıtım: ${plan.length} gün`);
    bus.contentChanged(schoolId);
    return { days: plan.length, skipped };
  });
}
