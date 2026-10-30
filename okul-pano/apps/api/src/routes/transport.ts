import { clearMonthSchema, normalizeName, tidyName, transportAutoFillSchema, transportDaySchema, transportImportSchema, trCompare, WEEKDAY_NAMES, zonedParts, schoolFullName } from '@okulpano/shared';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { audit, schoolGuard } from '../context.ts';
import { duties, teachers, transportDuties } from '../db/schema.ts';
import { badRequest, parse } from '../lib/errors.ts';
import { exportFileName, readXlsxUpload, sendXlsx } from '../lib/excel.ts';
import { monthRange, remapDate, resolveMonth } from '../lib/months.ts';
import { addTeachersToRoster, isNewTeacher, loadRoster } from '../lib/roster.ts';
import { dutyMonthSql } from '../lib/dayinfo.ts';
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

/** Eğitim yılı eylülde başlar: 2027-03 -> 2026-09 */
export function schoolYearStart(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${m >= 9 ? y : y - 1}-09`;
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
    // Resmî / dini tatillerde görevli olmaz: eskiden kalmış kayıt olsa da listelenmez (arife yarım gün, sayılır)
    const [from, to] = monthRange(month);
    const off = new Set((await holidaysInRange(db, req.ctx.schoolId, from, to)).filter((h) => !h.name.endsWith('Arifesi')).map((h) => h.date));
    const byDate = new Map<string, { id: string; fullName: string }[]>();
    for (const r of rows) if (!off.has(r.date)) byDate.set(r.date, [...(byDate.get(r.date) ?? []), { id: r.teacherId, fullName: r.teacherName }]);
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
      /** Kadroda olmayan, kaydederken kadroya eklenebilecek öğretmenler; position: dosyadaki sırası */
      const newTeachers: { name: string; position: number }[] = [];
      for (const name of e.names) {
        const t = roster.find(name);
        if (!t && isNewTeacher(roster, name)) {
          if (!newTeachers.some((n) => normalizeName(n.name) === normalizeName(name)))
            newTeachers.push({ name: tidyName(name), position: teachersFound.length + newTeachers.length });
        } else if (!t) {
          const hint = roster.suggest(name);
          issues.push({ row: e.row, message: `"${name}" kadroda yok${hint ? ` (${hint} mi?)` : "; önce Öğretmen Kadrosu'na ekleyin"}` });
        } else if (!teachersFound.some((x) => x.id === t.id)) {
          teachersFound.push({ id: t.id, fullName: t.fullName, written: name });
        }
      }
      const before = current.get(e.date) ?? [];
      const after = teachersFound.map((t) => t.id);
      // İsimlerin hiçbiri eşleşmediyse günü boşaltmak yerine atla
      if (e.names.length && !after.length && !newTeachers.length) return [];
      if (!after.length && !before.length && !newTeachers.length) return [];
      const status = !before.length ? 'new' : before.join() === after.join() && !newTeachers.length ? 'unchanged' : 'update';
      return [
        {
          row: e.row,
          date: e.date,
          from: e.from,
          day: WEEKDAY_NAMES[weekdayOfDate(e.date)],
          teachers: teachersFound,
          newTeachers,
          cleared: !after.length && !newTeachers.length,
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
      newTeachers: [...new Map(rows.flatMap((r) => r.newTeachers).map((n) => [normalizeName(n.name), n.name])).values()],
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
    let teachersAdded = 0;
    await db.transaction(async (tx) => {
      // Kadroda olmayan öğretmenler önce kadroya eklenir, sonra o günün görevlilerinin sonuna yazılır
      const names = body.days.flatMap((d) => d.newTeachers.map((n) => n.name));
      let roster = await loadRoster(tx, schoolId);
      if (names.length) ({ roster, added: teachersAdded } = await addTeachersToRoster(tx, schoolId, roster, names));
      const days = new Map(
        body.days.map((d) => {
          const ids = [...d.teacherIds];
          // Dosyadaki sıra korunur
          for (const n of [...d.newTeachers].sort((a, b) => a.position - b.position)) {
            const id = roster.find(n.name)?.id;
            if (id) ids.splice(n.position, 0, id);
          }
          return [d.date, [...new Set(ids)]];
        }),
      );
      await saveHolidays(tx, schoolId, body.holidays);
      if (!days.size) return;
      await tx.delete(transportDuties).where(and(eq(transportDuties.schoolId, schoolId), inArray(transportDuties.date, [...days.keys()])));
      const values = [...days].flatMap(([date, list]) => list.map((teacherId, i) => ({ schoolId, date, teacherId, sortOrder: i })));
      if (values.length) await tx.insert(transportDuties).values(values);
    });
    const dayCount = body.days.length;
    await audit(
      req,
      'update',
      'Taşımalı öğrenci görevlisi',
      null,
      `Excel'den servis nöbet çizelgesi: ${dayCount} gün${teachersAdded ? `, kadroya ${teachersAdded} öğretmen eklendi` : ''}`,
    );
    bus.contentChanged(schoolId);
    return { days: dayCount, teachersAdded };
  });

  /* ---------- Nöbet dengesi: eğitim yılı boyunca kim kaç servis nöbeti tuttu ---------- */

  /** Eğitim yılı başından ayın sonuna kadar öğretmen başına nöbet sayısı; tatile düşen eski kayıtlar sayılmaz */
  async function yearCounts(schoolId: string, month: string) {
    const [from] = monthRange(schoolYearStart(month));
    const [, to] = monthRange(month);
    const [rows, holidays] = await Promise.all([
      db
        .select({ date: transportDuties.date, teacherId: transportDuties.teacherId, fullName: teachers.fullName, isActive: teachers.isActive })
        .from(transportDuties)
        .innerJoin(teachers, eq(teachers.id, transportDuties.teacherId))
        .where(and(eq(transportDuties.schoolId, schoolId), gte(transportDuties.date, from), lte(transportDuties.date, to))),
      holidaysInRange(db, schoolId, from, to),
    ]);
    const off = new Set(holidays.filter((h) => !h.name.endsWith('Arifesi')).map((h) => h.date));
    const byTeacher = new Map<string, { id: string; fullName: string; isActive: boolean; month: number; total: number; last: string | null }>();
    for (const r of rows) {
      if (off.has(r.date)) continue;
      const t = byTeacher.get(r.teacherId) ?? { id: r.teacherId, fullName: r.fullName, isActive: r.isActive, month: 0, total: 0, last: null };
      t.total++;
      if (r.date.startsWith(month)) t.month++;
      if (!t.last || r.date > t.last) t.last = r.date;
      byTeacher.set(r.teacherId, t);
    }
    return { from, to, off, teachers: [...byTeacher.values()] };
  }

  /** ?month=YYYY-AA → eğitim yılı başından o ayın sonuna kadar öğretmen başına nöbet sayısı */
  app.get(`${base}/stats`, read, async (req) => {
    const { month } = req.query as { month?: string };
    if (!month || !MONTH_RE.test(month)) throw badRequest('Ay YYYY-AA biçiminde olmalı.');
    const { from, to, teachers: list } = await yearCounts(req.ctx.schoolId, month);
    const sorted = list.sort((a, b) => a.total - b.total || trCompare(a.fullName, b.fullName));
    const totals = sorted.filter((t) => t.isActive).map((t) => t.total);
    return {
      from,
      to,
      teachers: sorted,
      average: totals.length ? totals.reduce((x, y) => x + y, 0) / totals.length : 0,
      min: totals.length ? Math.min(...totals) : 0,
      max: totals.length ? Math.max(...totals) : 0,
    };
  });

  /**
   * Adil dağıtım: ayın boş (ya da eksik) iş günleri sırayla doldurulur. Her gün için eğitim yılında en az nöbet
   * tutan seçilir; eşitlikte o günün nöbetçi öğretmeni, sonra bir önceki iş günü görev almamış olan öne geçer.
   * Dolu günlere ve tatillere dokunulmaz.
   */
  app.post(`${base}/auto-fill`, write, async (req) => {
    const body = parse(transportAutoFillSchema, req.body);
    const schoolId = req.ctx.schoolId;
    const pool = await db
      .select({ id: teachers.id, fullName: teachers.fullName })
      .from(teachers)
      .where(and(eq(teachers.schoolId, schoolId), eq(teachers.isActive, true), inArray(teachers.id, [...new Set(body.teacherIds)])));
    if (!pool.length) throw badRequest('Seçilen öğretmenler bulunamadı.');
    if (pool.length < body.perDay) throw badRequest(`Günde ${body.perDay} görevli için en az ${body.perDay} öğretmen seçin.`);

    const [{ off, teachers: counted }, existing, dutyRows] = await Promise.all([
      yearCounts(schoolId, body.month),
      monthRows(schoolId, body.month),
      db
        .select({ weekday: duties.weekday, teacherId: duties.teacherId })
        .from(duties)
        .where(and(eq(duties.schoolId, schoolId), eq(duties.month, dutyMonthSql(schoolId, body.month)))),
    ]);
    const count = new Map(pool.map((t) => [t.id, counted.find((c) => c.id === t.id)?.total ?? 0]));
    const assigned = new Map<string, string[]>();
    for (const r of existing) if (!off.has(r.date)) assigned.set(r.date, [...(assigned.get(r.date) ?? []), r.teacherId]);
    const dutyOn = new Map<number, Set<string>>();
    for (const d of dutyRows) dutyOn.set(d.weekday, (dutyOn.get(d.weekday) ?? new Set()).add(d.teacherId));
    const names = new Map(pool.map((t) => [t.id, t.fullName]));

    const workdays = monthDays(body.month).filter((d) => d.weekday <= 5 && !off.has(d.date));
    const filled: { date: string; teacherIds: string[] }[] = [];
    let previous: string[] = [];
    for (const d of workdays) {
      const current = assigned.get(d.date) ?? [];
      const need = body.perDay - current.length;
      if (need > 0) {
        const picks = [...count.keys()]
          .filter((id) => !current.includes(id))
          .sort(
            (a, b) =>
              count.get(a)! - count.get(b)! ||
              Number(dutyOn.get(d.weekday)?.has(b) ?? false) - Number(dutyOn.get(d.weekday)?.has(a) ?? false) ||
              Number(previous.includes(a)) - Number(previous.includes(b)) ||
              trCompare(names.get(a)!, names.get(b)!),
          )
          .slice(0, need);
        for (const id of picks) count.set(id, count.get(id)! + 1);
        if (picks.length) filled.push({ date: d.date, teacherIds: [...current, ...picks] });
        previous = [...current, ...picks];
      } else {
        previous = current;
      }
    }

    if (filled.length) {
      await db.transaction(async (tx) => {
        await tx.delete(transportDuties).where(and(eq(transportDuties.schoolId, schoolId), inArray(transportDuties.date, filled.map((f) => f.date))));
        await tx.insert(transportDuties).values(filled.flatMap((f) => f.teacherIds.map((teacherId, i) => ({ schoolId, date: f.date, teacherId, sortOrder: i }))));
      });
      await audit(req, 'update', 'Taşımalı öğrenci görevlisi', null, `${body.month} adil dağıtım: ${filled.length} gün dolduruldu`);
      bus.contentChanged(schoolId);
    }
    return { days: filled.length, assignments: filled.reduce((n, f) => n + f.teacherIds.length - (assigned.get(f.date)?.length ?? 0), 0) };
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
      schoolName: schoolFullName(school.name, school.settings?.schoolType),
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
