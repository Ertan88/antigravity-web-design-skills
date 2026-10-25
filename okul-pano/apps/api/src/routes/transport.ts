import { clearMonthSchema, transportDaySchema, transportImportSchema, trCompare, WEEKDAY_NAMES, zonedParts } from '@okulpano/shared';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { audit, schoolGuard } from '../context.ts';
import { teachers, transportDuties } from '../db/schema.ts';
import { badRequest, parse } from '../lib/errors.ts';
import { exportFileName, readXlsxUpload, sendXlsx } from '../lib/excel.ts';
import { monthRange, remapDate, resolveMonth } from '../lib/months.ts';
import { loadRoster } from '../lib/roster.ts';
import { holidaysInRange, saveHolidays } from './holidays.ts';
import { trDate } from '../lib/sheets/duties.ts';
import { buildTransportWorkbook, parseTransportWorkbook } from '../lib/sheets/transport.ts';

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
 * Taşımalı öğrenci (servis) görevlileri: servisten indirme, öğle yemeği dağıtımı ve servise bindirme
 * için idarenin görevlendirdiği öğretmenler. Tarih bazlıdır; okulun aylık servis nöbet çizelgesi
 * Excel'den yüklenir ya da panelde gün gün düzenlenir.
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

  /** Excel önizleme: isimler kadroyla eşleştirilir (kısaltmalar dahil), mevcut kayıtlarla karşılaştırılır */
  app.post(`${base}/import/preview`, { ...write, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { month: chosen } = req.query as { month?: string };
    const parsed = await parseTransportWorkbook(await readXlsxUpload(req));
    const schoolId = req.ctx.schoolId;
    const roster = await loadRoster(db, schoolId);
    const today = zonedParts(new Date(), req.ctx.school.timezone).isoDate;
    // Ay başlıktan bulunur, tarihlerle karşılaştırılır; tarihler başka aydan kalmışsa seçilen aya taşınır
    const resolution = resolveMonth({ titleText: parsed.titleText, dates: parsed.entries.map((e) => e.date), chosen, today });
    const issues = [...parsed.issues];
    const entries = new Map<string, (typeof parsed.entries)[number] & { from: string | null }>();
    for (const e of parsed.entries) {
      const date = remapDate(e.date, resolution.month);
      if (!date) {
        issues.push({ row: e.row, message: `${e.date.split('-').reverse().join('.')} tarihinin seçilen ayda karşılığı yok; atlandı` });
        continue;
      }
      entries.set(date, { ...e, date, from: date === e.date ? null : e.date });
    }
    const holidays = [...entries.values()].filter((e) => e.holiday).map((e) => ({ date: e.date, name: e.holiday! }));
    // Çizelge o ayın tamamıdır: ayın bütün kayıtları ve tatilleri karşılaştırılır
    const [monthFrom, monthTo] = monthRange(resolution.month);
    const existing = await db
      .select({ date: transportDuties.date, teacherId: transportDuties.teacherId, sortOrder: transportDuties.sortOrder })
      .from(transportDuties)
      .where(and(eq(transportDuties.schoolId, schoolId), gte(transportDuties.date, monthFrom), lte(transportDuties.date, monthTo)))
      .orderBy(asc(transportDuties.sortOrder));
    const current = new Map<string, string[]>();
    for (const r of existing) current.set(r.date, [...(current.get(r.date) ?? []), r.teacherId]);
    // Resmî / dini tatiller ve dosyada tatil yazılan günler: görevli yazılmaz (arife yarım gün, sayılmaz)
    const offDays = new Map<string, string>();
    for (const h of await holidaysInRange(db, schoolId, monthFrom, monthTo)) if (!h.name.endsWith('Arifesi')) offDays.set(h.date, h.name);
    for (const h of holidays) offDays.set(h.date, h.name);
    for (const e of entries.values()) {
      const off = offDays.get(e.date);
      if (off && e.names.length) {
        issues.push({ row: e.row, message: `${e.date.split('-').reverse().join('.')} tatil (${off}); görevli yazılmadı` });
        e.names = [];
      }
      if (off) e.holiday = off;
    }
    // Dosyada hiç yer almayan ama kayıtlı görevlisi olan günler (ör. listeden çıkarılan tatil günleri) temizlenir
    for (const date of current.keys()) {
      if (!entries.has(date)) entries.set(date, { row: 0, date, names: [], holiday: offDays.get(date) ?? null, from: null });
    }

    const rows = [...entries.values()].flatMap((e) => {
      const teachersFound: { id: string; fullName: string; written: string }[] = [];
      for (const name of e.names) {
        const t = roster.find(name);
        if (!t) {
          const hint = roster.suggest(name);
          issues.push({ row: e.row, message: `"${name}" kadroda yok${hint ? ` (${hint} mi?)` : "; önce Öğretmen Kadrosu'na ekleyin"}` });
        } else if (!teachersFound.some((x) => x.id === t.id)) {
          teachersFound.push({ id: t.id, fullName: t.fullName, written: name });
        }
      }
      const before = current.get(e.date) ?? [];
      const after = teachersFound.map((t) => t.id);
      // İsimlerin hiçbiri eşleşmediyse günü boşaltmak yerine atla
      if (e.names.length && !after.length) return [];
      if (!after.length && !before.length) return [];
      const status = !before.length ? 'new' : before.join() === after.join() ? 'unchanged' : 'update';
      return [
        {
          row: e.row,
          date: e.date,
          from: e.from,
          day: WEEKDAY_NAMES[weekdayOfDate(e.date)],
          teachers: teachersFound,
          cleared: !after.length,
          holiday: e.holiday,
          /** Dosyada yoktu; ayın listesi dosyadan ibaret olduğu için silinecek */
          missing: e.row === 0,
          status,
        },
      ];
    });
    issues.sort((x, y) => x.row - y.row);
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return {
      sheetName: parsed.sheetName,
      month: resolution,
      rows,
      holidays,
      issues,
      totals: {
        new: rows.filter((r) => r.status === 'new').length,
        update: rows.filter((r) => r.status === 'update').length,
        unchanged: rows.filter((r) => r.status === 'unchanged').length,
        skipped: issues.length,
      },
    };
  });

  /** Önizlemesi onaylanan günler yazılır; dosyada olmayan tarihlere dokunulmaz */
  app.post(`${base}/import`, write, async (req) => {
    const body = parse(transportImportSchema, req.body);
    const schoolId = req.ctx.schoolId;
    const ids = [...new Set(body.days.flatMap((d) => d.teacherIds))];
    if (ids.length) {
      const found = await db.select({ id: teachers.id }).from(teachers).where(and(eq(teachers.schoolId, schoolId), inArray(teachers.id, ids)));
      if (found.length !== ids.length) throw badRequest('Öğretmen bulunamadı.');
    }
    const days = new Map(body.days.map((d) => [d.date, [...new Set(d.teacherIds)]]));
    await db.transaction(async (tx) => {
      await saveHolidays(tx, schoolId, body.holidays);
      if (!days.size) return;
      await tx.delete(transportDuties).where(and(eq(transportDuties.schoolId, schoolId), inArray(transportDuties.date, [...days.keys()])));
      const values = [...days].flatMap(([date, list]) => list.map((teacherId, i) => ({ schoolId, date, teacherId, sortOrder: i })));
      if (values.length) await tx.insert(transportDuties).values(values);
    });
    await audit(req, 'update', 'Taşımalı öğrenci görevlisi', null, `Excel'den servis nöbet çizelgesi: ${days.size} gün`);
    bus.contentChanged(schoolId);
    return { days: days.size };
  });

  /** Bir ayın tüm servis nöbetlerini siler */
  app.post(`${base}/clear`, write, async (req) => {
    const { month } = parse(clearMonthSchema, req.body);
    const schoolId = req.ctx.schoolId;
    const [from, to] = monthRange(month);
    const del = await db
      .delete(transportDuties)
      .where(and(eq(transportDuties.schoolId, schoolId), gte(transportDuties.date, from), lte(transportDuties.date, to)))
      .returning({ id: transportDuties.id });
    await audit(req, 'delete', 'Taşımalı öğrenci görevlisi', null, `${month} temizlendi (${del.length} kayıt)`);
    bus.contentChanged(schoolId);
    return { removed: del.length };
  });

  async function workbook(req: FastifyRequest, withData: boolean) {
    const { schoolId, school } = req.ctx;
    const { month: q } = req.query as { month?: string };
    if (q && !MONTH_RE.test(q)) throw badRequest('Ay YYYY-AA biçiminde olmalı.');
    const month = q ?? zonedParts(new Date(), school.timezone).isoDate.slice(0, 7);
    const [roster, rows] = await Promise.all([loadRoster(db, schoolId), withData ? monthRows(schoolId, month) : Promise.resolve([])]);
    const days = new Map<string, string[]>();
    for (const r of rows) days.set(r.date, [...(days.get(r.date) ?? []), r.teacherName]);
    return buildTransportWorkbook({
      schoolName: school.name,
      teachers: roster.rows.filter((t) => t.isActive).map((t) => t.fullName).sort(trCompare),
      year: Number(month.slice(0, 4)),
      month: Number(month.slice(5, 7)),
      days,
    });
  }

  app.get(`${base}/template`, read, async (req, reply) => sendXlsx(reply, await workbook(req, false), 'servis-nobet-sablonu.xlsx'));
  app.get(`${base}/export`, read, async (req, reply) =>
    sendXlsx(reply, await workbook(req, true), exportFileName('servis-nobet-cizelgesi', req.ctx.school.name)),
  );
}

const weekdayOfDate = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
