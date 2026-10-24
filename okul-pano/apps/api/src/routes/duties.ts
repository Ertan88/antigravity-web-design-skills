import { dutyImportSchema, dutySchema, dutySupervisorSchema, normalizeName, tidyName, trCompare, WEEKDAY_NAMES, zonedParts } from '@okulpano/shared';
import { and, asc, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { audit, schoolGuard } from '../context.ts';
import type { DB } from '../db/client.ts';
import { duties, dutySupervisors, teachers } from '../db/schema.ts';
import { badRequest, conflict, parse } from '../lib/errors.ts';
import { exportFileName, readXlsxUpload, sendXlsx } from '../lib/excel.ts';
import { buildDutiesWorkbook, parseDutiesWorkbook, trDate } from '../lib/sheets/duties.ts';
import { registerResource } from './crud.ts';

/** Basit düzenleme mesafesi: "Ayse Demır" yazılmışsa "Ayşe Demir mi?" önerisi için */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Türkçe karakter hatalarını da yakalamak için harfleri sadeleştirerek karşılaştırır */
const loose = (s: string) =>
  normalizeName(s).replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

async function loadRoster(db: DB, schoolId: string) {
  const rows = await db
    .select({ id: teachers.id, fullName: teachers.fullName, isActive: teachers.isActive })
    .from(teachers)
    .where(eq(teachers.schoolId, schoolId));
  // Aynı isimde aktif ve pasif kayıt varsa aktif olan seçilir
  rows.sort((a, b) => Number(b.isActive) - Number(a.isActive));
  const byName = new Map<string, (typeof rows)[number]>();
  for (const t of rows) if (!byName.has(normalizeName(t.fullName))) byName.set(normalizeName(t.fullName), t);
  const suggest = (name: string): string | null => {
    const target = loose(name);
    let best: { name: string; d: number } | null = null;
    for (const t of rows) {
      const d = editDistance(target, loose(t.fullName));
      if (d <= Math.max(2, Math.floor(target.length / 6)) && (!best || d < best.d)) best = { name: t.fullName, d };
    }
    return best?.name ?? null;
  };
  return { rows, byName, suggest };
}

const dutyKey = (weekday: number, area: string, teacherId: string) => `${weekday}|${normalizeName(area)}|${teacherId}`;

/** "2026-09" -> ayın ilk ve son günü */
function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(days).padStart(2, '0')}`];
}
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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
    orderBy: [asc(duties.weekday), asc(duties.sortOrder), asc(duties.area)],
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

  async function currentDuties(schoolId: string) {
    return db
      .select({ id: duties.id, weekday: duties.weekday, area: duties.area, teacherId: duties.teacherId, sortOrder: duties.sortOrder, teacherName: teachers.fullName })
      .from(duties)
      .innerJoin(teachers, eq(teachers.id, duties.teacherId))
      .where(eq(duties.schoolId, schoolId))
      .orderBy(asc(duties.weekday), asc(duties.sortOrder), asc(duties.area));
  }

  /**
   * Çizelge satır sırası: Pazartesi'den başlayıp her günün kendi sırasıyla okunduğunda nöbet yerinin
   * ilk göründüğü yer. Yalnızca hafta sonu kullanılan yerler doğal olarak sona kalır.
   */
  function areaOrder(rows: { area: string }[]): string[] {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(normalizeName(r.area))) seen.set(normalizeName(r.area), r.area);
    return [...seen.values()];
  }

  app.post(`${base}/import/preview`, { ...write, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const parsed = await parseDutiesWorkbook(await readXlsxUpload(req));
    const schoolId = req.ctx.schoolId;
    const [roster, existing, existingSup] = await Promise.all([
      loadRoster(db, schoolId),
      currentDuties(schoolId),
      parsed.supervisors.length
        ? db
            .select({ date: dutySupervisors.date, name: dutySupervisors.name })
            .from(dutySupervisors)
            .where(and(eq(dutySupervisors.schoolId, schoolId), inArray(dutySupervisors.date, parsed.supervisors.map((x) => x.date))))
        : Promise.resolve([]),
    ]);
    const issues = [...parsed.issues];
    const supByDate = new Map(existingSup.map((x) => [x.date, x.name]));
    const supervisors = parsed.supervisors.map((x) => ({
      date: x.date,
      name: x.name,
      status: !supByDate.has(x.date) ? ('new' as const) : supByDate.get(x.date) === x.name ? ('unchanged' as const) : ('update' as const),
    }));
    const existingKeys = new Set(existing.map((d) => dutyKey(d.weekday, d.area, d.teacherId)));
    const knownAreas = new Set(existing.map((d) => normalizeName(d.area)));
    const newAreas = new Map<string, string>();
    const fileKeys = new Set<string>();

    const rows = parsed.entries.flatMap((e) => {
      const teacher = roster.byName.get(normalizeName(e.teacherName));
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

    // "Değiştir" seçilirse: dosyadaki günlerin dosyada olmayan nöbetleri silinir
    const removed = existing
      .filter((d) => parsed.weekdays.includes(d.weekday) && !fileKeys.has(dutyKey(d.weekday, d.area, d.teacherId)))
      .map((d) => ({ day: WEEKDAY_NAMES[d.weekday], area: d.area, teacherName: d.teacherName }));

    issues.sort((a, b) => a.row - b.row);
    return {
      sheetName: parsed.sheetName,
      layout: parsed.layout,
      weekdays: parsed.weekdays,
      rows,
      issues,
      removed,
      supervisors,
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
      if (body.mode === 'replace') {
        const del = await tx
          .delete(duties)
          .where(and(eq(duties.schoolId, schoolId), inArray(duties.weekday, body.weekdays)))
          .returning({ id: duties.id });
        removed = del.length;
      }
      const existing = await tx
        .select({ weekday: duties.weekday, area: duties.area, teacherId: duties.teacherId })
        .from(duties)
        .where(eq(duties.schoolId, schoolId));
      const keys = new Set(existing.map((d) => dutyKey(d.weekday, d.area, d.teacherId)));
      // Aynı yerin farklı yazımları ("bahçe" / "Bahçe") tek yazıma indirgenir
      const spelling = new Map(existing.map((d) => [normalizeName(d.area), d.area]));
      const areaIndex = new Map<string, number>();

      const inserts: (typeof duties.$inferInsert)[] = [];
      let skipped = 0;
      let unchanged = 0;
      for (const r of body.rows) {
        const teacher = roster.byName.get(normalizeName(r.teacherName));
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
        inserts.push({ schoolId, weekday: r.weekday, area, teacherId: teacher.id, sortOrder: areaIndex.get(areaKey)! });
      }
      if (inserts.length) await tx.insert(duties).values(inserts);

      // Müdür yardımcıları tarihe göre yazılır; "değiştir"de dosyadaki aylarda dosyada olmayan tarihler silinir
      let supervisors = 0;
      if (body.supervisors.length) {
        if (body.mode === 'replace') {
          const months = [...new Set(body.supervisors.map((x) => x.date.slice(0, 7)))].map(monthRange);
          const dates = body.supervisors.map((x) => x.date);
          await tx
            .delete(dutySupervisors)
            .where(
              and(
                eq(dutySupervisors.schoolId, schoolId),
                or(...months.map(([from, to]) => and(gte(dutySupervisors.date, from), lte(dutySupervisors.date, to)))),
                sql`${dutySupervisors.date} not in (${sql.join(dates.map((d) => sql`${d}::date`), sql`, `)})`,
              ),
            );
        }
        const byDate = new Map(body.supervisors.map((x) => [x.date, tidyName(x.name)]));
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
      return { created: inserts.length, removed, unchanged, skipped, supervisors };
    });

    await audit(
      req,
      'update',
      'Nöbet',
      null,
      `Excel'den nöbet çizelgesi (${body.mode === 'replace' ? 'değiştir' : 'ekle'}): ${result.created} eklendi, ${result.removed} kaldırıldı`,
    );
    bus.contentChanged(schoolId);
    return result;
  });

  async function workbook(req: { ctx: { schoolId: string; school: { name: string; timezone: string } }; query: unknown }, withData: boolean) {
    const { schoolId, school } = req.ctx;
    const { month: q } = req.query as { month?: string };
    if (q && !MONTH_RE.test(q)) throw badRequest('Ay YYYY-AA biçiminde olmalı.');
    const month = q ?? zonedParts(new Date(), school.timezone).isoDate.slice(0, 7);
    const [from, to] = monthRange(month);
    const [roster, rows, sups] = await Promise.all([
      loadRoster(db, schoolId),
      currentDuties(schoolId),
      withData
        ? db
            .select({ date: dutySupervisors.date, name: dutySupervisors.name })
            .from(dutySupervisors)
            .where(and(eq(dutySupervisors.schoolId, schoolId), gte(dutySupervisors.date, from), lte(dutySupervisors.date, to)))
        : Promise.resolve([]),
    ]);
    const weekdays = [1, 2, 3, 4, 5, ...[6, 7].filter((d) => rows.some((r) => r.weekday === d))];
    const days = new Map<number, { area: string; teacherName: string }[]>();
    if (withData) for (const r of rows) days.set(r.weekday, [...(days.get(r.weekday) ?? []), { area: r.area, teacherName: r.teacherName }]);
    return buildDutiesWorkbook({
      schoolName: school.name,
      teachers: roster.rows.filter((t) => t.isActive).map((t) => t.fullName).sort(trCompare),
      areas: areaOrder(rows),
      weekdays,
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
