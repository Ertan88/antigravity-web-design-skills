import {
  clearMonthSchema,
  dutyImportSchema,
  dutySchema,
  dutySupervisorSchema,
  holidayDatesInMonth,
  monthSchema,
  normalizeName,
  tidyName,
  trCompare,
  WEEKDAY_NAMES,
  zonedParts,
} from '@okulpano/shared';
import { z } from 'zod';
import { and, asc, desc, eq, gte, inArray, lte, notInArray, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { audit, schoolGuard } from '../context.ts';
import { duties, dutySupervisors, teachers } from '../db/schema.ts';
import { badRequest, conflict, parse } from '../lib/errors.ts';
import { exportFileName, readXlsxUpload, sendXlsx } from '../lib/excel.ts';
import { buildDutiesWorkbook, parseDutiesWorkbook, trDate } from '../lib/sheets/duties.ts';
import { registerResource } from './crud.ts';
import { MONTH_RE, monthRange, remapDate, resolveMonth } from '../lib/months.ts';
import { loadRoster } from '../lib/roster.ts';
import { saveHolidays } from './holidays.ts';

const dutyKey = (weekday: number, area: string, teacherId: string) => `${weekday}|${normalizeName(area)}|${teacherId}`;


export async function dutyRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const base = '/api/schools/:schoolId/duties';
  const read = { preHandler: [app.authenticate, schoolGuard()] };
  const write = { preHandler: [app.authenticate, schoolGuard('duties.manage')] };

  registerResource(app, {
    path: 'duties',
    entity: 'Nöbet',
    table: duties,
    permission: 'duties.manage',
    schema: dutySchema,
    orderBy: [asc(duties.month), asc(duties.weekday), asc(duties.sortOrder), asc(duties.area)],
    refs: { teacherId: teachers },
    summary: (r) => `${WEEKDAY_NAMES[r.weekday as number] ?? ''} · ${r.area}`,
  });

  /** Nöbetçi müdür yardımcısı: tarih başına tek kayıt. ?month=YYYY-AA ile o ay listelenir. */
  registerResource(app, {
    path: 'duty-supervisors',
    entity: 'Nöbetçi müdür yardımcısı',
    table: dutySupervisors,
    permission: 'duties.manage',
    schema: dutySupervisorSchema,
    toRow: (i) => ({ date: i.date, name: tidyName(i.name) }),
    summary: (r) => `${trDate(String(r.date))} · ${r.name}`,
    validate: async (req, row, id) => {
      const [other] = await db
        .select({ id: dutySupervisors.id })
        .from(dutySupervisors)
        .where(and(eq(dutySupervisors.schoolId, req.ctx.schoolId), eq(dutySupervisors.date, row.date as string)));
      if (other && other.id !== id) throw conflict(`${trDate(row.date as string)} için zaten bir nöbetçi müdür yardımcısı var.`);
    },
    list: async (req) => {
      const { month } = req.query as { month?: string };
      const where: SQL[] = [eq(dutySupervisors.schoolId, req.ctx.schoolId)];
      if (month) {
        if (!MONTH_RE.test(month)) throw badRequest('Ay YYYY-AA biçiminde olmalı.');
        const [from, to] = monthRange(month);
        where.push(gte(dutySupervisors.date, from), lte(dutySupervisors.date, to));
      }
      return db.select().from(dutySupervisors).where(and(...where)).orderBy(asc(dutySupervisors.date));
    },
  });

  async function currentDuties(schoolId: string, month: string) {
    return db
      .select({ id: duties.id, weekday: duties.weekday, area: duties.area, teacherId: duties.teacherId, sortOrder: duties.sortOrder, teacherName: teachers.fullName })
      .from(duties)
      .innerJoin(teachers, eq(teachers.id, duties.teacherId))
      .where(and(eq(duties.schoolId, schoolId), eq(duties.month, month)))
      .orderBy(asc(duties.weekday), asc(duties.sortOrder), asc(duties.area));
  }

  /** Verilen aya en yakın (önceki, yoksa sonraki) çizelgesi olan ay */
  async function nearestMonth(schoolId: string, month: string): Promise<string | null> {
    const [before] = await db
      .select({ month: duties.month })
      .from(duties)
      .where(and(eq(duties.schoolId, schoolId), lte(duties.month, month)))
      .orderBy(desc(duties.month))
      .limit(1);
    if (before) return before.month;
    const [after] = await db.select({ month: duties.month }).from(duties).where(eq(duties.schoolId, schoolId)).orderBy(asc(duties.month)).limit(1);
    return after?.month ?? null;
  }

  /**
   * Çizelge satır sırası: Pazartesi'den başlayıp her günün kendi sırasıyla okunduğunda nöbet yerinin
   * ilk göründüğü yer.
   */
  function areaOrder(rows: { area: string }[]): string[] {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(normalizeName(r.area))) seen.set(normalizeName(r.area), r.area);
    return [...seen.values()];
  }

  /**
   * Önizleme: ay başlıktaki "AİT OLDUĞU AY"dan bulunur, tarihlerle karşılaştırılır (?month= ile seçilebilir).
   * Başka aya ait tarihler (eski aydan kalmış) seçilen aydaki aynı hafta gününe taşınır.
   */
  app.post(`${base}/import/preview`, { ...write, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { month: chosen } = req.query as { month?: string };
    const parsed = await parseDutiesWorkbook(await readXlsxUpload(req));
    const schoolId = req.ctx.schoolId;
    const today = zonedParts(new Date(), req.ctx.school.timezone).isoDate;
    const resolution = resolveMonth({
      titleText: parsed.titleText,
      dates: [...parsed.supervisors.map((x) => x.date), ...parsed.holidays.flatMap((h) => (h.date ? [h.date] : []))],
      chosen,
      today,
    });
    const month = resolution.month;
    const [year, monthNo] = month.split('-').map(Number) as [number, number];
    const issues = [...parsed.issues];

    // Müdür yardımcıları: tarihler seçilen aya taşınır
    const supervisorMap = new Map<string, { date: string; name: string; from: string | null }>();
    for (const x of parsed.supervisors) {
      const date = remapDate(x.date, month);
      if (!date) {
        issues.push({ row: x.row, message: `${x.date.split('-').reverse().join('.')} tarihinin ${monthNo}. ayda karşılığı yok; atlandı` });
        continue;
      }
      supervisorMap.set(date, { date, name: x.name, from: date === x.date ? null : x.date });
    }

    // Tatiller: yanında tarih varsa o tarih, yoksa adından (ör. Cumhuriyet Bayramı -> 29 Ekim) bulunur
    const holidayMap = new Map<string, { date: string; name: string }>();
    const undatedHolidays: { name: string; day: string | null }[] = [];
    for (const h of parsed.holidays) {
      // Tatil hafta gününe göre başka aya taşınmaz: tarih bu aydaysa o, değilse adından bu aydaki tarihi aranır
      const dates = h.date?.startsWith(month)
        ? [h.date]
        : holidayDatesInMonth(h.name, year, monthNo).filter(
            (d) => !h.weekday || ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1 === h.weekday,
          );
      if (dates.length) for (const d of dates) holidayMap.set(d, { date: d, name: h.name });
      else if (!undatedHolidays.some((u) => u.name === h.name)) undatedHolidays.push({ name: h.name, day: h.weekday ? (WEEKDAY_NAMES[h.weekday] ?? null) : null });
      // Tatil yazılmış tarihte müdür yardımcısı olmaz
      for (const d of dates) supervisorMap.delete(d);
    }

    const supDates = [...supervisorMap.keys()];
    const [roster, existing, existingSup] = await Promise.all([
      loadRoster(db, schoolId),
      currentDuties(schoolId, month),
      supDates.length
        ? db
            .select({ date: dutySupervisors.date, name: dutySupervisors.name })
            .from(dutySupervisors)
            .where(and(eq(dutySupervisors.schoolId, schoolId), inArray(dutySupervisors.date, supDates)))
        : Promise.resolve([]),
    ]);
    const supByDate = new Map(existingSup.map((x) => [x.date, x.name]));
    const supervisors = [...supervisorMap.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((x) => ({
        ...x,
        status: !supByDate.has(x.date) ? ('new' as const) : supByDate.get(x.date) === x.name ? ('unchanged' as const) : ('update' as const),
      }));
    const existingKeys = new Set(existing.map((d) => dutyKey(d.weekday, d.area, d.teacherId)));
    const knownAreas = new Set(existing.map((d) => normalizeName(d.area)));
    const newAreas = new Map<string, string>();
    const fileKeys = new Set<string>();

    const rows = parsed.entries.flatMap((e) => {
      const teacher = roster.find(e.teacherName);
      if (!teacher) {
        const hint = roster.suggest(e.teacherName);
        issues.push({
          row: e.row,
          message: `"${e.teacherName}" kadroda yok${hint ? ` (${hint} mi?)` : '; önce Öğretmen Kadrosu\'na ekleyin'}`,
        });
        return [];
      }
      const key = dutyKey(e.weekday, e.area, teacher.id);
      if (fileKeys.has(key)) return [];
      fileKeys.add(key);
      if (!knownAreas.has(normalizeName(e.area))) newAreas.set(normalizeName(e.area), e.area);
      return [
        {
          row: e.row,
          weekday: e.weekday,
          day: WEEKDAY_NAMES[e.weekday],
          area: e.area,
          teacherName: teacher.fullName,
          teacherInactive: !teacher.isActive,
          status: existingKeys.has(key) ? ('unchanged' as const) : ('new' as const),
        },
      ];
    });

    // "Değiştir" seçilirse: o ayın, dosyadaki günlerinde dosyada olmayan nöbetleri silinir
    const removed = existing
      .filter((d) => parsed.weekdays.includes(d.weekday) && !fileKeys.has(dutyKey(d.weekday, d.area, d.teacherId)))
      .map((d) => ({ day: WEEKDAY_NAMES[d.weekday], area: d.area, teacherName: d.teacherName }));

    issues.sort((a, b) => a.row - b.row);
    return {
      sheetName: parsed.sheetName,
      layout: parsed.layout,
      month: resolution,
      weekdays: parsed.weekdays,
      rows,
      issues,
      removed,
      supervisors,
      holidays: [...holidayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      undatedHolidays,
      additions: newAreas.size ? [{ label: 'Yeni nöbet yerleri', values: [...newAreas.values()] }] : [],
      totals: {
        new: rows.filter((r) => r.status === 'new').length,
        update: 0,
        unchanged: rows.filter((r) => r.status === 'unchanged').length,
        skipped: issues.length,
        removed: removed.length,
        supervisors: supervisors.filter((x) => x.status !== 'unchanged').length,
      },
    };
  });

  app.post(`${base}/import`, write, async (req) => {
    const body = parse(dutyImportSchema, req.body);
    const schoolId = req.ctx.schoolId;
    const roster = await loadRoster(db, schoolId);

    const result = await db.transaction(async (tx) => {
      let removed = 0;
      if (body.mode === 'replace' && body.weekdays.length) {
        const del = await tx
          .delete(duties)
          .where(and(eq(duties.schoolId, schoolId), eq(duties.month, body.month), inArray(duties.weekday, body.weekdays)))
          .returning({ id: duties.id });
        removed = del.length;
      }
      const existing = await tx
        .select({ weekday: duties.weekday, area: duties.area, teacherId: duties.teacherId })
        .from(duties)
        .where(and(eq(duties.schoolId, schoolId), eq(duties.month, body.month)));
      const keys = new Set(existing.map((d) => dutyKey(d.weekday, d.area, d.teacherId)));
      // Aynı yerin farklı yazımları ("bahçe" / "Bahçe") tek yazıma indirgenir
      const spelling = new Map(existing.map((d) => [normalizeName(d.area), d.area]));
      const areaIndex = new Map<string, number>();

      const inserts: (typeof duties.$inferInsert)[] = [];
      let skipped = 0;
      let unchanged = 0;
      for (const r of body.rows) {
        const teacher = roster.find(r.teacherName);
        if (!teacher) {
          skipped++;
          continue;
        }
        const areaKey = normalizeName(r.area);
        if (!spelling.has(areaKey)) spelling.set(areaKey, tidyName(r.area));
        if (!areaIndex.has(areaKey)) areaIndex.set(areaKey, areaIndex.size);
        const area = spelling.get(areaKey)!;
        const key = dutyKey(r.weekday, area, teacher.id);
        if (keys.has(key)) {
          unchanged++;
          continue;
        }
        keys.add(key);
        inserts.push({ schoolId, month: body.month, weekday: r.weekday, area, teacherId: teacher.id, sortOrder: areaIndex.get(areaKey)! });
      }
      if (inserts.length) await tx.insert(duties).values(inserts);

      // Müdür yardımcıları yalnızca seçilen ayın tarihlerine yazılır; "değiştir"de o ayın dosyada olmayan tarihleri silinir
      const supervisorsInMonth = body.supervisors.filter((x) => x.date.startsWith(body.month));
      let supervisors = 0;
      if (body.mode === 'replace' && supervisorsInMonth.length) {
        const [from, to] = monthRange(body.month);
        await tx
          .delete(dutySupervisors)
          .where(
            and(
              eq(dutySupervisors.schoolId, schoolId),
              gte(dutySupervisors.date, from),
              lte(dutySupervisors.date, to),
              notInArray(dutySupervisors.date, supervisorsInMonth.map((x) => x.date)),
            ),
          );
      }
      if (supervisorsInMonth.length) {
        const byDate = new Map(supervisorsInMonth.map((x) => [x.date, tidyName(x.name)]));
        const written = await tx
          .insert(dutySupervisors)
          .values([...byDate].map(([date, name]) => ({ schoolId, date, name })))
          .onConflictDoUpdate({
            target: [dutySupervisors.schoolId, dutySupervisors.date],
            set: { name: sql`excluded.name`, updatedAt: new Date() },
          })
          .returning({ id: dutySupervisors.id });
        supervisors = written.length;
      }
      const holidays = await saveHolidays(tx, schoolId, body.holidays);
      return { created: inserts.length, removed, unchanged, skipped, supervisors, holidays };
    });

    await audit(
      req,
      'update',
      'Nöbet',
      null,
      `Excel'den ${body.month} nöbet çizelgesi (${body.mode === 'replace' ? 'değiştir' : 'ekle'}): ${result.created} eklendi, ${result.removed} kaldırıldı`,
    );
    bus.contentChanged(schoolId);
    return result;
  });

  /** Bir ayın nöbet listesini başka aydan kopyalar (yeni ay için hazır başlangıç) */
  app.post(`${base}/copy`, write, async (req) => {
    const body = parse(z.object({ from: monthSchema, to: monthSchema }), req.body);
    const schoolId = req.ctx.schoolId;
    const source = await db.select().from(duties).where(and(eq(duties.schoolId, schoolId), eq(duties.month, body.from)));
    const copied = await db.transaction(async (tx) => {
      await tx.delete(duties).where(and(eq(duties.schoolId, schoolId), eq(duties.month, body.to)));
      if (!source.length) return 0;
      await tx.insert(duties).values(
        source.map((d) => ({ schoolId, month: body.to, weekday: d.weekday, area: d.area, teacherId: d.teacherId, sortOrder: d.sortOrder })),
      );
      return source.length;
    });
    await audit(req, 'update', 'Nöbet', null, `${body.from} nöbet çizelgesi ${body.to} ayına kopyalandı (${copied})`);
    bus.contentChanged(schoolId);
    return { copied };
  });

  /** Bir ayın tüm nöbetlerini siler */
  app.post(`${base}/clear`, write, async (req) => {
    const { month } = parse(clearMonthSchema, req.body);
    const schoolId = req.ctx.schoolId;
    const del = await db.delete(duties).where(and(eq(duties.schoolId, schoolId), eq(duties.month, month))).returning({ id: duties.id });
    await audit(req, 'delete', 'Nöbet', null, `${month} nöbet çizelgesi temizlendi (${del.length})`);
    bus.contentChanged(schoolId);
    return { removed: del.length };
  });

  /** Bir ayın tüm nöbetçi müdür yardımcısı kayıtlarını siler */
  app.post('/api/schools/:schoolId/duty-supervisors/clear', write, async (req) => {
    const { month } = parse(clearMonthSchema, req.body);
    const schoolId = req.ctx.schoolId;
    const [from, to] = monthRange(month);
    const del = await db
      .delete(dutySupervisors)
      .where(and(eq(dutySupervisors.schoolId, schoolId), gte(dutySupervisors.date, from), lte(dutySupervisors.date, to)))
      .returning({ id: dutySupervisors.id });
    await audit(req, 'delete', 'Nöbetçi müdür yardımcısı', null, `${month} temizlendi (${del.length})`);
    bus.contentChanged(schoolId);
    return { removed: del.length };
  });

  async function workbook(req: { ctx: { schoolId: string; school: { name: string; timezone: string } }; query: unknown }, withData: boolean) {
    const { schoolId, school } = req.ctx;
    const { month: q } = req.query as { month?: string };
    if (q && !MONTH_RE.test(q)) throw badRequest('Ay YYYY-AA biçiminde olmalı.');
    const month = q ?? zonedParts(new Date(), school.timezone).isoDate.slice(0, 7);
    const [from, to] = monthRange(month);
    // Nöbet yerleri o ayın, yoksa en yakın ayın çizelgesinden gelir
    const areaMonth = (await nearestMonth(schoolId, month)) ?? month;
    const [roster, rows, areaRows, sups] = await Promise.all([
      loadRoster(db, schoolId),
      currentDuties(schoolId, month),
      currentDuties(schoolId, areaMonth),
      withData
        ? db
            .select({ date: dutySupervisors.date, name: dutySupervisors.name })
            .from(dutySupervisors)
            .where(and(eq(dutySupervisors.schoolId, schoolId), gte(dutySupervisors.date, from), lte(dutySupervisors.date, to)))
        : Promise.resolve([]),
    ]);
    const days = new Map<number, { area: string; teacherName: string }[]>();
    if (withData) for (const r of rows) days.set(r.weekday, [...(days.get(r.weekday) ?? []), { area: r.area, teacherName: r.teacherName }]);
    return buildDutiesWorkbook({
      schoolName: school.name,
      teachers: roster.rows.filter((t) => t.isActive).map((t) => t.fullName).sort(trCompare),
      areas: areaOrder(rows.length ? rows : areaRows),
      // Okul nöbet çizelgesi hafta içi günlerinden oluşur
      weekdays: [1, 2, 3, 4, 5],
      year: Number(month.slice(0, 4)),
      month: Number(month.slice(5, 7)),
      days,
      supervisors: new Map(sups.map((x) => [x.date, x.name])),
    });
  }

  app.get(`${base}/template`, read, async (req, reply) =>
    sendXlsx(reply, await workbook(req, false), 'nobet-cizelgesi-sablonu.xlsx'),
  );

  app.get(`${base}/export`, read, async (req, reply) =>
    sendXlsx(reply, await workbook(req, true), exportFileName('nobet-cizelgesi', req.ctx.school.name)),
  );
}
