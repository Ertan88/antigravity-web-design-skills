import { trCompare, validatePeriods } from '@okulpano/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, schoolGuard } from '../context.ts';
import { bellSchedules, classGroups, schools, teachers, timetableEntries } from '../db/schema.ts';
import { badRequest, parse } from '../lib/errors.ts';
import { buildClasses, isSpecialEducation, parseEokulPage, readPdfPages, teacherDisplayName, teacherKey, timesToPeriods, type EokulPage } from '../lib/sheets/eokul.ts';

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const entrySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  periodNo: z.number().int().min(1).max(30),
  subject: z.string().trim().min(1).max(120),
  teachers: z.array(z.string().trim().min(2).max(120)).max(4),
  group: z.string().trim().max(120).nullable(),
});
const applySchema = z.object({
  classes: z
    .array(z.object({ name: z.string().trim().min(1).max(60), entries: z.array(entrySchema).max(400) }))
    .min(1)
    .max(300),
  /** Kadroda olmayan öğretmenler eklensin mi (eklenmezse o dersler öğretmensiz yazılır) */
  createTeachers: z.boolean().default(true),
  /**
   * e-Okul'daki ders saatleri: saatleri aynı sınıflar bir zil. İlki okulun ana zilinin yerine yazılır, diğerleri
   * (ör. ikili öğretimde öğlenci) ayrı zil olarak eklenir ve o sınıflara atanır. Boşsa zil çizelgelerine dokunulmaz.
   */
  bells: z
    .array(
      z.object({
        periods: z.array(z.object({ no: z.number().int().min(1).max(30), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })).min(1).max(30),
        classNames: z.array(z.string().trim().min(1).max(60)).max(300),
      }),
    )
    .max(10)
    .default([]),
  /** Zil hesabına katılmayacak sınıflar (ör. özel eğitim) */
  exemptClasses: z.array(z.string().trim().min(1).max(60)).max(300).default([]),
});

async function readPdfUpload(req: FastifyRequest): Promise<Uint8Array> {
  const file = await req.file({ limits: { fileSize: MAX_PDF_BYTES } });
  if (!file) throw badRequest('Dosya bulunamadı.');
  if (!/\.pdf$/i.test(file.filename)) throw badRequest("Lütfen e-Okul'dan indirdiğiniz ders programı PDF dosyasını yükleyin.");
  const data = await file.toBuffer();
  if (file.file.truncated) throw badRequest('Dosya 10 MB sınırını aşıyor.');
  return new Uint8Array(data);
}

/**
 * e-Okul ders programı PDF'inden toplu yükleme. Önizleme dosyayı okur ve kadroyla karşılaştırır (hiçbir şey
 * yazmaz); uygula, önizlemenin döndürdüğü programı kaydeder: eksik sınıflar (ve istenirse öğretmenler) eklenir,
 * okulun bütün ders programı yenisiyle değiştirilir.
 */
export async function timetableImportRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const base = '/api/schools/:schoolId/timetable/import/eokul';
  const write = { preHandler: [app.authenticate, schoolGuard('schedule.manage')] };

  app.post(`${base}/preview`, { ...write, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const data = await readPdfUpload(req);
    let pages: EokulPage[] = [];
    const failed: number[] = [];
    try {
      const raw = await readPdfPages(data);
      raw.forEach((items, i) => {
        const page = parseEokulPage(items, i + 1);
        if (page) pages.push(page);
        else failed.push(i + 1);
      });
    } catch {
      throw badRequest('PDF okunamadı. Dosyanın e-Okul\'dan indirilen ders programı çizelgesi olduğundan emin olun.');
    }
    if (!pages.length) throw badRequest("Bu PDF'te e-Okul ders programı bulunamadı. e-Okul > Ders Programı > Haftalık ders programı çizelgesi PDF'ini yükleyin.");
    pages = pages.sort((a, b) => a.page - b.page);
    const classes = buildClasses(pages);

    const schoolId = req.ctx.schoolId;
    const [existingClasses, existingTeachers, schedules] = await Promise.all([
      db.select({ id: classGroups.id, name: classGroups.name }).from(classGroups).where(eq(classGroups.schoolId, schoolId)),
      db.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers).where(eq(teachers.schoolId, schoolId)),
      db.select().from(bellSchedules).where(eq(bellSchedules.schoolId, schoolId)).orderBy(asc(bellSchedules.sortOrder)),
    ]);
    const classByKey = new Map(existingClasses.map((c) => [teacherKey(c.name), c]));
    const teacherByKey = new Map(existingTeachers.map((t) => [teacherKey(t.fullName), t]));

    const lessonsOf = new Map<string, number>();
    for (const c of classes) for (const e of c.entries) for (const t of e.teachers) lessonsOf.set(t, (lessonsOf.get(t) ?? 0) + 1);
    const teacherList = [...lessonsOf]
      .map(([name, lessons]) => {
        const match = teacherByKey.get(teacherKey(name));
        return { name, displayName: teacherDisplayName(name), lessons, match: match ? { id: match.id, fullName: match.fullName } : null };
      })
      .sort((a, b) => trCompare(a.name, b.name));

    // e-Okul'daki ders saatleri: saatleri aynı olan sınıflar bir zil (ikili öğretimde sabahçı / öğlenci gibi)
    // Ortak ders numaralarında saatleri aynı olan sayfalar (biri 10, öbürü 11 satır basılmış olsa da) aynı zildir
    const bells: { periods: ReturnType<typeof timesToPeriods>; classNames: string[] }[] = [];
    for (const c of classes) {
      const periods = timesToPeriods(c.times);
      const same = bells.find(
        (b) =>
          periods.some((p) => b.periods.some((q) => q.no === p.no)) &&
          periods.every((p) => b.periods.every((q) => q.no !== p.no || (q.start === p.start && q.end === p.end))) &&
          !validatePeriods([...b.periods, ...periods.filter((p) => !b.periods.some((q) => q.no === p.no))]),
      );
      if (!same) {
        bells.push({ periods, classNames: [c.name] });
        continue;
      }
      same.classNames.push(c.name);
      for (const p of periods) if (!same.periods.some((q) => q.no === p.no)) same.periods.push(p);
      same.periods.sort((x, y) => x.no - y.no);
    }
    bells.sort((a, b) => b.classNames.length - a.classNames.length);
    // e-Okul saatleri okulun ilk otomatik (sabahçı) düzeniyle karşılaştırılır
    const main = [...schedules].filter((s) => !s.weekdays.length && s.shift !== 'afternoon').sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? schedules[0];
    const bell = (bells[0]?.periods ?? [])
      .map((p) => {
        const sp = main?.periods.find((x) => x.no === p.no);
        return { no: p.no, pdf: `${p.start}-${p.end}`, school: sp ? `${sp.start}-${sp.end}` : null };
      })
      .filter((b) => b.school !== null && b.pdf !== b.school);

    const all = classes.flatMap((c) => c.entries);
    return {
      pages: pages.length,
      failedPages: failed,
      stats: {
        classes: classes.length,
        lessons: all.length,
        split: all.filter((e) => e.teachers.length > 1).length,
        electives: all.filter((e) => e.subject.endsWith('(Seçmeli)')).length,
        noTeacher: all.filter((e) => !e.teachers.length).length,
        grouped: all.filter((e) => e.group).length,
      },
      classes: classes.map((c) => ({
        name: c.name,
        program: c.program,
        field: c.field,
        groups: c.groups,
        lessons: c.entries.length,
        existing: classByKey.has(teacherKey(c.name)),
        special: isSpecialEducation(c),
        entries: c.entries,
      })),
      teachers: teacherList,
      bell: { schedule: main?.name ?? null, mismatches: bell },
      bells,
    };
  });

  app.post(`${base}/apply`, write, async (req) => {
    const body = parse(applySchema, req.body);
    const schoolId = req.ctx.schoolId;
    const result = await db.transaction(async (tx) => {
      // Sınıflar: adla eşleşir, olmayan eklenir
      const existing = await tx.select({ id: classGroups.id, name: classGroups.name }).from(classGroups).where(eq(classGroups.schoolId, schoolId));
      const classId = new Map(existing.map((c) => [teacherKey(c.name), c.id]));
      const [{ maxOrder } = { maxOrder: 0 }] = await tx
        .select({ maxOrder: sql<number>`coalesce(max(${classGroups.sortOrder}), 0)::int` })
        .from(classGroups)
        .where(eq(classGroups.schoolId, schoolId));
      let order = maxOrder;
      let classesCreated = 0;
      for (const c of body.classes) {
        if (classId.has(teacherKey(c.name))) continue;
        const [row] = await tx.insert(classGroups).values({ schoolId, name: c.name, sortOrder: ++order }).returning({ id: classGroups.id });
        classId.set(teacherKey(c.name), row!.id);
        classesCreated++;
      }

      // Öğretmenler: kadrodaki adla eşleşir; olmayanlar istenirse kadroya eklenir
      const staff = await tx.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers).where(eq(teachers.schoolId, schoolId));
      const teacherId = new Map(staff.map((t) => [teacherKey(t.fullName), t.id]));
      let teachersCreated = 0;
      if (body.createTeachers) {
        const names = [...new Set(body.classes.flatMap((c) => c.entries.flatMap((e) => e.teachers)))];
        for (const name of names) {
          if (teacherId.has(teacherKey(name))) continue;
          const [row] = await tx.insert(teachers).values({ schoolId, fullName: teacherDisplayName(name) }).returning({ id: teachers.id });
          teacherId.set(teacherKey(name), row!.id);
          teachersCreated++;
        }
      }

      // Zil hesabına katılmayacak sınıflar (ör. özel eğitim)
      const exemptIds = body.exemptClasses.map((n) => classId.get(teacherKey(n))).filter((x): x is string => Boolean(x));
      if (exemptIds.length) await tx.update(classGroups).set({ bellExempt: true }).where(and(eq(classGroups.schoolId, schoolId), inArray(classGroups.id, exemptIds)));

      // Zil düzeni e-Okul saatlerinden. Saatleri farklı iki düzen varsa ikili öğretim: erken başlayan sabahçı, diğeri öğlenci.
      // Her vardiyada günün en sık görülen ders sayısı için "N derslik gün" düzeni yazılır (varsa saatleri güncellenir);
      // diğer ders sayıları için düzen panelde önerilir.
      let bellsUpdated = 0;
      if (body.bells.length) {
        for (const b of body.bells) {
          const problem = validatePeriods(b.periods);
          if (problem) throw badRequest(`e-Okul ders saatleri okunamadı: ${problem}`);
        }
        const bells = [...body.bells].sort((a, b) => a.periods[0]!.start.localeCompare(b.periods[0]!.start)).slice(0, 2);
        const dual = bells.length > 1;
        const shiftOf = new Map<string, 'morning' | 'afternoon'>();
        bells.forEach((b, i) => b.classNames.forEach((n) => shiftOf.set(teacherKey(n), i === 0 ? 'morning' : 'afternoon')));
        if (dual) {
          for (const shift of ['morning', 'afternoon'] as const) {
            const ids = [...shiftOf].filter(([, s]) => s === shift).map(([k]) => classId.get(k)).filter((x): x is string => Boolean(x));
            if (ids.length) await tx.update(classGroups).set({ shift }).where(and(eq(classGroups.schoolId, schoolId), inArray(classGroups.id, ids)));
          }
        }
        await tx
          .update(schools)
          .set({ settings: sql`coalesce(${schools.settings}, '{}'::jsonb) || ${JSON.stringify({ dualShift: dual })}::jsonb` })
          .where(eq(schools.id, schoolId));

        const exempt = new Set(body.exemptClasses.map(teacherKey));
        const existing = await tx.select().from(bellSchedules).where(eq(bellSchedules.schoolId, schoolId));
        for (const [i, b] of bells.entries()) {
          const shift = i === 0 ? null : 'afternoon';
          // Günün ders sayısı: bu vardiyadaki sınıfların o gün en geç biten dersi; en sık görülen sayı esas düzen olur
          const perDay = new Map<number, number>();
          for (const c of body.classes) {
            if (exempt.has(teacherKey(c.name)) || (shiftOf.get(teacherKey(c.name)) ?? 'morning') !== (shift ?? 'morning')) continue;
            for (const e of c.entries) perDay.set(e.weekday, Math.max(perDay.get(e.weekday) ?? 0, e.periodNo));
          }
          const freq = new Map<number, number>();
          for (const n of perDay.values()) freq.set(n, (freq.get(n) ?? 0) + 1);
          const count = [...freq].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0] ?? b.periods.length;
          const periods = b.periods.filter((p) => p.no <= count);
          const same = existing.find((s) => !s.weekdays.length && (s.shift ?? null) === shift && (s.lessonCount ?? s.periods.length) === count);
          if (same) await tx.update(bellSchedules).set({ periods, lessonCount: count, updatedAt: new Date() }).where(eq(bellSchedules.id, same.id));
          else
            await tx.insert(bellSchedules).values({
              schoolId,
              name: `${count} derslik gün${dual ? (shift ? ' · Öğlenci' : ' · Sabahçı') : ''}`,
              weekdays: [],
              lessonCount: count,
              shift,
              periods,
              source: 'eokul',
              sortOrder: i,
            });
          bellsUpdated++;
        }
      }

      // Okulun bütün programı yenisiyle değiştirilir; bölünmüş derste her öğretmen için bir kayıt
      await tx.delete(timetableEntries).where(eq(timetableEntries.schoolId, schoolId));
      const rows = body.classes.flatMap((c) =>
        c.entries.flatMap((e) => {
          const ids = e.teachers.map((t) => teacherId.get(teacherKey(t)) ?? null);
          return (ids.length ? ids : [null]).map((tid) => ({
            schoolId,
            weekday: e.weekday,
            periodNo: e.periodNo,
            classGroupId: classId.get(teacherKey(c.name))!,
            subject: e.subject,
            teacherId: tid,
            groupLabel: e.group,
          }));
        }),
      );
      for (let i = 0; i < rows.length; i += 500) await tx.insert(timetableEntries).values(rows.slice(i, i + 500));
      return { classesCreated, teachersCreated, entries: rows.length, bellsUpdated, exempt: exemptIds.length };
    });
    await audit(req, 'update', 'Ders programı', null, `e-Okul PDF'inden yüklendi: ${body.classes.length} sınıf, ${result.entries} kayıt`);
    bus.contentChanged(schoolId);
    return result;
  });
}

