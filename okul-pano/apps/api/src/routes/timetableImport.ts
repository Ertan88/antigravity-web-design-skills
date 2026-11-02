import { trCompare } from '@okulpano/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, schoolGuard } from '../context.ts';
import { bellSchedules, classGroups, teachers, timetableEntries } from '../db/schema.ts';
import { badRequest, parse } from '../lib/errors.ts';
import { buildClasses, parseEokulPage, readPdfPages, teacherDisplayName, teacherKey, type EokulPage } from '../lib/sheets/eokul.ts';

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

    // PDF'teki ders saatleri okulun hafta içi zil çizelgesiyle karşılaştırılır (çizelge değiştirilmez)
    const times = new Map<number, string>();
    for (const p of pages) for (const [no, time] of Object.entries(p.times)) times.set(Number(no), time);
    const weekday = schedules.find((s) => s.weekdays.includes(1)) ?? schedules[0];
    const bell = [...times]
      .sort((a, b) => a[0] - b[0])
      .map(([no, time]) => {
        const p = weekday?.periods.find((x) => x.no === no);
        return { no, pdf: time, school: p ? `${p.start}-${p.end}` : null };
      })
      .filter((b) => b.pdf !== b.school);

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
        entries: c.entries,
      })),
      teachers: teacherList,
      bell: { schedule: weekday?.name ?? null, mismatches: bell },
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
      return { classesCreated, teachersCreated, entries: rows.length };
    });
    await audit(req, 'update', 'Ders programı', null, `e-Okul PDF'inden yüklendi: ${body.classes.length} sınıf, ${result.entries} kayıt`);
    bus.contentChanged(schoolId);
    return result;
  });
}

