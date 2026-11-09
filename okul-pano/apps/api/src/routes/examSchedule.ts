import { randomUUID } from 'node:crypto';
import { compareClassNames, examImportSchema, examScheduleCreateSchema, examScheduleSchema, normalizeName, parseClassName, schoolFullName, trCompare, zonedParts, type ScheduledExam } from '@okulpano/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../context.ts';
import { audit, schoolGuard } from '../context.ts';
import { classGroups, examSchedule, memberships, teachers, timetableEntries } from '../db/schema.ts';
import { addDays } from '../lib/dayinfo.ts';
import { badRequest, notFound, parse } from '../lib/errors.ts';
import { readXlsxUpload, sendXlsx } from '../lib/excel.ts';
import { classKey, examTeacherIds, listExams, loadExamContext, resolveExam, subjectKey } from '../lib/examSchedule.ts';
import { notifyUsers } from '../lib/push.ts';
import { buildExamsWorkbook, parseExamsWorkbook } from '../lib/sheets/exams.ts';
import { addToInbox } from './notifications.ts';

/*
 * Sınav takvimi: sınıf + gün + ders saati. Liste hesaplanmış hâliyle (saat, gözetmen, dersin öğretmeni,
 * hatırlatma anı) döner. Excel şablonu, önizleme ve içe aktarma; değişiklikte ilgili öğretmenlere bildirim.
 */

const trDay = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const rangeQuery = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
const MAX_RANGE_DAYS = 400;

/** Sınav eklenen / değişen / silinen öğretmenlere tek bildirim (kullanıcı başına) */
async function tellTeachers(deps: AppDeps, schoolId: string, today: string, changes: { exam: ScheduledExam; what: 'added' | 'changed' | 'removed' }[]) {
  const upcoming = changes.filter((c) => c.exam.date >= today);
  if (!upcoming.length) return;
  const teacherIds = [...new Set(upcoming.flatMap((c) => examTeacherIds(c.exam)))];
  if (!teacherIds.length) return;
  const links = await deps.db
    .select({ userId: memberships.userId, teacherId: memberships.teacherId })
    .from(memberships)
    .where(and(eq(memberships.schoolId, schoolId), inArray(memberships.teacherId, teacherIds)));
  const byUser = new Map<string, typeof upcoming>();
  for (const l of links) {
    const mine = upcoming.filter((c) => examTeacherIds(c.exam).includes(l.teacherId!));
    if (mine.length) byUser.set(l.userId, [...(byUser.get(l.userId) ?? []), ...mine]);
  }
  const verb = { added: 'eklendi', changed: 'değişti', removed: 'kaldırıldı' } as const;
  for (const [userId, list] of byUser) {
    const first = list[0]!;
    const title = list.length === 1 ? `Sınav ${verb[first.what]}` : 'Sınav takvimi güncellendi';
    const body =
      list.length === 1
        ? `${first.exam.className} ${first.exam.subject} · ${trDay(first.exam.date)}, ${first.exam.periodNo}. ders`
        : `${list.length} sınavınızda değişiklik var. En yakını: ${first.exam.className} ${first.exam.subject} · ${trDay(first.exam.date)}`;
    await addToInbox(deps.db, [userId], { key: `exam:${randomUUID()}`, kind: 'exam', title, body, to: '/sinav-takvimi', schoolId });
    notifyUsers(deps, [userId], { title, body, url: '/sinav-takvimi' });
  }
}

export async function examScheduleRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const base = '/api/schools/:schoolId/exam-schedule';
  const read = { preHandler: [app.authenticate, schoolGuard()] };
  const write = { preHandler: [app.authenticate, schoolGuard('exams.manage')] };
  const todayOf = (tz: string) => zonedParts(new Date(), tz).isoDate;

  /** Tek sınav (hesaplanmış hâliyle) */
  async function resolveOne(school: Parameters<typeof listExams>[1], id: string) {
    const [row] = await db.select().from(examSchedule).where(and(eq(examSchedule.id, id), eq(examSchedule.schoolId, school.id)));
    if (!row) return null;
    return resolveExam(await loadExamContext(db, school, row.date, row.date), row);
  }

  async function checkRefs(schoolId: string, input: { classGroupId: string; proctorTeacherId?: string | null }) {
    const [cls] = await db.select({ id: classGroups.id }).from(classGroups).where(and(eq(classGroups.id, input.classGroupId), eq(classGroups.schoolId, schoolId)));
    if (!cls) throw badRequest('Sınıf bulunamadı.');
    if (input.proctorTeacherId) {
      const [t] = await db.select({ id: teachers.id }).from(teachers).where(and(eq(teachers.id, input.proctorTeacherId), eq(teachers.schoolId, schoolId)));
      if (!t) throw badRequest('Gözetmen öğretmen bulunamadı.');
    }
  }

  const slotTaken = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code === '23505' || (err as { cause?: { code?: string } })?.cause?.code === '23505';

  /** Tarih aralığındaki sınavlar (varsayılan: bugünden 60 gün) */
  app.get(base, read, async (req) => {
    const q = parse(rangeQuery, req.query);
    const today = todayOf(req.ctx.school.timezone);
    const from = q.from ?? today;
    const to = q.to ?? addDays(from, 60);
    if (to < from) throw badRequest('Bitiş tarihi başlangıçtan önce olamaz.');
    if (Date.parse(to) - Date.parse(from) > MAX_RANGE_DAYS * 86400_000) throw badRequest(`En fazla ${MAX_RANGE_DAYS} günlük aralık istenebilir.`);
    return { today, from, to, exams: await listExams(db, req.ctx.school, from, to) };
  });

  /** Form için seçenekler: sınıflar, öğretmenler ve ders programındaki ders adları (sınıf başına) */
  app.get(`${base}/options`, read, async (req) => {
    const schoolId = req.ctx.schoolId;
    const [classes, staff, subjects] = await Promise.all([
      db.select({ id: classGroups.id, name: classGroups.name }).from(classGroups).where(eq(classGroups.schoolId, schoolId)),
      db.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers).where(and(eq(teachers.schoolId, schoolId), eq(teachers.isActive, true))),
      db.selectDistinct({ classGroupId: timetableEntries.classGroupId, subject: timetableEntries.subject }).from(timetableEntries).where(eq(timetableEntries.schoolId, schoolId)),
    ]);
    const byClass: Record<string, string[]> = {};
    for (const s of subjects) (byClass[s.classGroupId] ??= []).push(s.subject);
    for (const k of Object.keys(byClass)) byClass[k] = [...new Set(byClass[k])].sort(trCompare);
    return {
      classes: classes.sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true })),
      teachers: staff.sort((a, b) => trCompare(a.fullName, b.fullName)),
      subjects: [...new Set(subjects.map((s) => s.subject))].sort(trCompare),
      subjectsByClass: byClass,
    };
  });

  app.post(base, write, async (req, reply) => {
    const { classGroupId, classGroupIds, ...body } = parse(examScheduleCreateSchema, req.body);
    const { schoolId, school, userId } = req.ctx;
    const ids = [...new Set(classGroupIds?.length ? classGroupIds : [classGroupId!])];
    if (ids.length > 1 && body.proctorTeacherId) throw badRequest('Birden çok şubede gözetmen ders programından bulunur; gerekirse eklendikten sonra şube şube değiştirin.');
    if (ids.length === 1) await checkRefs(schoolId, { classGroupId: ids[0]!, proctorTeacherId: body.proctorTeacherId });
    else {
      const found = await db.select({ id: classGroups.id }).from(classGroups).where(and(eq(classGroups.schoolId, schoolId), inArray(classGroups.id, ids)));
      if (found.length !== ids.length) throw badRequest('Sınıf bulunamadı.');
    }
    // Aynı saatte sınavı olan şubeler önceden söylenir (hangi şube olduğu yazılır)
    const taken = await db
      .select({ name: classGroups.name })
      .from(examSchedule)
      .innerJoin(classGroups, eq(classGroups.id, examSchedule.classGroupId))
      .where(and(eq(examSchedule.schoolId, schoolId), eq(examSchedule.date, body.date), eq(examSchedule.periodNo, body.periodNo), inArray(examSchedule.classGroupId, ids)));
    if (taken.length)
      throw badRequest(
        ids.length === 1 ? 'Bu sınıfın o gün o ders saatinde zaten bir sınavı var.' : `Şu şubelerin o gün o ders saatinde zaten sınavı var: ${taken.map((t) => t.name).sort(trCompare).join(', ')}.`,
      );
    let rows: { id: string }[];
    try {
      rows = await db
        .insert(examSchedule)
        .values(ids.map((id) => ({ schoolId, ...body, classGroupId: id, proctorTeacherId: body.proctorTeacherId ?? null, note: body.note?.trim() || null, createdBy: userId })))
        .returning({ id: examSchedule.id });
    } catch (err) {
      if (slotTaken(err)) throw badRequest('Bu sınıfın o gün o ders saatinde zaten bir sınavı var.');
      throw err;
    }
    const exams = (await Promise.all(rows.map((r) => resolveOne(school, r.id)))).filter((e): e is ScheduledExam => Boolean(e));
    const first = exams[0]!;
    await audit(req, 'create', 'Sınav takvimi', first.id, `${exams.map((e) => e.className).join(', ')} ${first.subject} · ${first.date} ${first.periodNo}. ders`);
    bus.contentChanged(schoolId);
    await tellTeachers(app.deps, schoolId, todayOf(school.timezone), exams.map((exam) => ({ exam, what: 'added' as const })));
    // Tek şubede eski yanıt biçimi korunur; çok şubede bütün kayıtlar döner
    return reply.status(201).send(ids.length === 1 ? first : { exams });
  });

  app.put(`${base}/:id`, write, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(examScheduleSchema, req.body);
    const { schoolId, school } = req.ctx;
    const before = await resolveOne(school, id);
    if (!before) throw notFound('Sınav bulunamadı.');
    await checkRefs(schoolId, body);
    try {
      await db
        .update(examSchedule)
        .set({ ...body, proctorTeacherId: body.proctorTeacherId ?? null, note: body.note?.trim() || null, updatedAt: new Date() })
        .where(and(eq(examSchedule.id, id), eq(examSchedule.schoolId, schoolId)));
    } catch (err) {
      if (slotTaken(err)) throw badRequest('Bu sınıfın o gün o ders saatinde zaten bir sınavı var.');
      throw err;
    }
    const exam = (await resolveOne(school, id))!;
    await audit(req, 'update', 'Sınav takvimi', id, `${exam.className} ${exam.subject} · ${exam.date} ${exam.periodNo}. ders`);
    bus.contentChanged(schoolId);
    // Eski kayıttaki öğretmenler de (ör. gözetmen değiştiyse) haberdar olur
    const today = todayOf(school.timezone);
    const gone = examTeacherIds(before).filter((t) => !examTeacherIds(exam).includes(t));
    await tellTeachers(app.deps, schoolId, today, [
      { exam, what: 'changed' },
      ...(gone.length ? [{ exam: { ...before, proctors: before.proctors.filter((p) => gone.includes(p.teacherId)), subjectTeachers: before.subjectTeachers.filter((t) => gone.includes(t.teacherId)) }, what: 'removed' as const }] : []),
    ]);
    return exam;
  });

  app.delete(`${base}/:id`, write, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { schoolId, school } = req.ctx;
    const exam = await resolveOne(school, id);
    if (!exam) throw notFound('Sınav bulunamadı.');
    await db.delete(examSchedule).where(and(eq(examSchedule.id, id), eq(examSchedule.schoolId, schoolId)));
    await audit(req, 'delete', 'Sınav takvimi', id, `${exam.className} ${exam.subject} · ${exam.date} ${exam.periodNo}. ders`);
    bus.contentChanged(schoolId);
    await tellTeachers(app.deps, schoolId, todayOf(school.timezone), [{ exam, what: 'removed' }]);
    return reply.status(204).send();
  });

  /** Excel şablonu: okulun sınıfları, ders programındaki dersler ve öğretmenler açılır listede */
  app.get(`${base}/template`, read, async (req, reply) => {
    const schoolId = req.ctx.schoolId;
    const [classes, subjects, staff] = await Promise.all([
      db.select({ name: classGroups.name }).from(classGroups).where(eq(classGroups.schoolId, schoolId)),
      db.selectDistinct({ subject: timetableEntries.subject }).from(timetableEntries).where(eq(timetableEntries.schoolId, schoolId)),
      db.select({ fullName: teachers.fullName }).from(teachers).where(and(eq(teachers.schoolId, schoolId), eq(teachers.isActive, true))),
    ]);
    const buf = await buildExamsWorkbook({
      schoolName: schoolFullName(req.ctx.school.name, req.ctx.school.settings?.schoolType),
      classes: classes.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'tr', { numeric: true })),
      subjects: subjects.map((s) => s.subject).sort(trCompare),
      teachers: staff.map((t) => t.fullName).sort(trCompare),
    });
    return sendXlsx(reply, buf, 'sinav-takvimi-sablonu.xlsx');
  });

  /**
   * Excel önizlemesi: hiçbir şey kaydetmez. Her satır "ok" (hazır), "warn" (kaydedilir ama kontrol edin) ya da
   * "error" (kaydedilmez) olarak döner; sınıf ve ders adları sistemdekilerle eşleştirilir.
   */
  app.post(`${base}/import/preview`, { ...write, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const parsed = await parseExamsWorkbook(await readXlsxUpload(req));
    const { schoolId, school } = req.ctx;
    const dates = parsed.rows.map((r) => r.date).sort();
    const from = dates[0] ?? todayOf(school.timezone);
    const to = dates[dates.length - 1] ?? from;
    const [ctx, existing] = await Promise.all([
      loadExamContext(db, school, from, to),
      parsed.rows.length
        ? db.select({ date: examSchedule.date, periodNo: examSchedule.periodNo, classGroupId: examSchedule.classGroupId }).from(examSchedule).where(eq(examSchedule.schoolId, schoolId))
        : Promise.resolve([]),
    ]);
    const classByKey = new Map(ctx.classes.map((c) => [classKey(c.name), c]));
    const teacherByKey = new Map(ctx.staff.map((t) => [normalizeName(t.fullName), t]));
    const taken = new Set(existing.map((e) => `${e.date}|${e.periodNo}|${e.classGroupId}`));
    const seen = new Map<string, number>();
    const bellCache = new Map();
    const today = todayOf(school.timezone);

    // "9", "9. sınıflar", "AMP 10" ya da "9-A, 9-B" yazılan satır o kademenin / listedeki şubelerin her biri için açılır
    const expandClasses = (raw: string): string[] | null => {
      const t = raw.trim();
      if (classByKey.has(classKey(t))) return null;
      if (/[,;]/.test(t)) return t.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
      const m = /^(?:([A-Za-zÇĞİÖŞÜçğıöşü]{2,6})\s+)?(\d{1,2})\s*\.?\s*(?:sınıf(?:lar|ları)?)?$/iu.exec(t);
      if (!m) return null;
      const program = m[1] ? m[1].toLocaleUpperCase('tr-TR') : null;
      const level = Number(m[2]);
      const names = ctx.classes
        .map((c) => c.name)
        .filter((n) => {
          const p = parseClassName(n);
          return p && p.grade === level && p.program === program;
        })
        .sort(compareClassNames);
      return names.length ? names : null;
    };
    const sourceRows = parsed.rows.flatMap((r) => expandClasses(r.className)?.map((className) => ({ ...r, className })) ?? [r]);

    const rows = sourceRows.map((r) => {
      const messages: string[] = [];
      const cls = classByKey.get(classKey(r.className));
      if (!cls) return { ...r, status: 'error' as const, messages: [`"${r.className}" sınıfı bulunamadı`], classGroupId: null, classLabel: r.className, exists: false };
      if (cls.name !== r.className.trim()) messages.push(`Sınıf "${r.className}" → ${cls.name}`);
      const slot = `${r.date}|${r.periodNo}|${cls.id}`;
      const dup = seen.get(slot);
      if (dup !== undefined) return { ...r, status: 'error' as const, messages: [`Aynı sınıf ve ders saati dosyada iki kez var (ilk: ${dup}. satır)`], classGroupId: cls.id, classLabel: cls.name, exists: false };
      seen.set(slot, r.row);

      // Ders adı: sınıfın programındaki dersle eşleştir ("Mat." → Matematik)
      const classSubjects = [...new Set(ctx.lessons.filter((l) => l.classGroupId === cls.id).map((l) => l.subject))];
      let subject = r.subject;
      const key = subjectKey(r.subject);
      const exact = classSubjects.find((s) => subjectKey(s) === key);
      if (exact) subject = exact;
      else {
        const prefix = key.replace(/\s+$/, '');
        const guesses = prefix.length >= 3 ? classSubjects.filter((s) => subjectKey(s).startsWith(prefix)) : [];
        if (guesses.length === 1) {
          subject = guesses[0]!;
          messages.push(`Ders "${r.subject}" → ${subject}`);
        }
      }
      if (r.kindGuessed) messages.push('Tür anlaşılamadı; Yazılı sayıldı');
      let proctorTeacherId: string | null = null;
      if (r.proctorName) {
        const t = teacherByKey.get(normalizeName(r.proctorName));
        if (t) proctorTeacherId = t.id;
        else messages.push(`Gözetmen "${r.proctorName}" bulunamadı; ders programından bulunacak`);
      }
      if (r.date < today) messages.push('Tarih geçmişte');
      const resolved = resolveExam(ctx, { id: '', date: r.date, periodNo: r.periodNo, classGroupId: cls.id, subject, kind: r.kind, note: r.note, proctorTeacherId }, bellCache);
      messages.push(...resolved.warnings);
      return {
        ...r,
        subject,
        classGroupId: cls.id,
        classLabel: cls.name,
        proctorTeacherId,
        exists: taken.has(slot),
        start: resolved.start,
        proctors: resolved.proctors.map((p) => p.fullName + (p.onLeave ? ' (izinli)' : '')),
        subjectTeachers: resolved.subjectTeachers.map((t) => t.fullName),
        status: messages.length ? ('warn' as const) : ('ok' as const),
        messages,
      };
    });
    const errors = [
      ...parsed.issues.map((i) => ({ row: i.row, message: i.message })),
      ...rows.filter((r) => r.status === 'error').map((r) => ({ row: r.row, message: r.messages.join('; ') })),
    ].sort((a, b) => a.row - b.row);
    const good = rows.filter((r) => r.status !== 'error');
    return {
      rows: good,
      errors,
      totals: {
        ok: good.filter((r) => r.status === 'ok').length,
        warn: good.filter((r) => r.status === 'warn').length,
        error: errors.length,
        update: good.filter((r) => r.exists).length,
      },
    };
  });

  /** Önizlemeden onaylanan satırlar: aynı gün + ders saati + sınıf varsa güncellenir */
  app.post(`${base}/import`, write, async (req) => {
    const { rows } = parse(examImportSchema, req.body);
    const { schoolId, school, userId } = req.ctx;
    const [classes, staff] = await Promise.all([
      db.select({ id: classGroups.id }).from(classGroups).where(eq(classGroups.schoolId, schoolId)),
      db.select({ id: teachers.id }).from(teachers).where(eq(teachers.schoolId, schoolId)),
    ]);
    const classIds = new Set(classes.map((c) => c.id));
    const teacherIds = new Set(staff.map((t) => t.id));
    const bad = rows.find((r) => !classIds.has(r.classGroupId) || (r.proctorTeacherId && !teacherIds.has(r.proctorTeacherId)));
    if (bad) throw badRequest('Satırlardan birinde sınıf ya da gözetmen bu okulda bulunamadı.');
    const slots = new Set<string>();
    for (const r of rows) {
      const k = `${r.date}|${r.periodNo}|${r.classGroupId}`;
      if (slots.has(k)) throw badRequest('Aynı sınıf ve ders saati iki kez gönderildi.');
      slots.add(k);
    }
    const existing = await db
      .select({ id: examSchedule.id, date: examSchedule.date, periodNo: examSchedule.periodNo, classGroupId: examSchedule.classGroupId })
      .from(examSchedule)
      .where(eq(examSchedule.schoolId, schoolId));
    const idBySlot = new Map(existing.map((e) => [`${e.date}|${e.periodNo}|${e.classGroupId}`, e.id]));
    const touched: { id: string; what: 'added' | 'changed' }[] = [];
    await db.transaction(async (tx) => {
      for (const r of rows) {
        const values = { ...r, proctorTeacherId: r.proctorTeacherId ?? null, note: r.note?.trim() || null };
        const id = idBySlot.get(`${r.date}|${r.periodNo}|${r.classGroupId}`);
        if (id) {
          await tx.update(examSchedule).set({ ...values, updatedAt: new Date() }).where(eq(examSchedule.id, id));
          touched.push({ id, what: 'changed' });
        } else {
          const [row] = await tx.insert(examSchedule).values({ schoolId, ...values, createdBy: userId }).returning({ id: examSchedule.id });
          touched.push({ id: row!.id, what: 'added' });
        }
      }
    });
    const created = touched.filter((t) => t.what === 'added').length;
    const updated = touched.length - created;
    await audit(req, 'create', 'Sınav takvimi', null, `${created} sınav eklendi, ${updated} güncellendi (Excel)`);
    bus.contentChanged(schoolId);
    const dates = rows.map((r) => r.date).sort();
    const resolved = await listExams(db, school, dates[0]!, dates[dates.length - 1]!);
    const what = new Map(touched.map((t) => [t.id, t.what]));
    await tellTeachers(
      app.deps,
      schoolId,
      todayOf(school.timezone),
      resolved.filter((e) => what.has(e.id)).map((exam) => ({ exam, what: what.get(exam.id)! })),
    );
    return { created, updated };
  });

  /** Seçilen sınavları siler (ör. yanlış yüklenen bir dosya) */
  app.post(`${base}/delete-many`, write, async (req) => {
    const { ids } = parse(z.object({ ids: z.array(z.uuid()).min(1).max(2000) }), req.body);
    const { schoolId, school } = req.ctx;
    const rows = await db.select().from(examSchedule).where(and(eq(examSchedule.schoolId, schoolId), inArray(examSchedule.id, ids))).orderBy(asc(examSchedule.date));
    if (!rows.length) return { deleted: 0 };
    const ctx = await loadExamContext(db, school, rows[0]!.date, rows[rows.length - 1]!.date);
    const resolved = rows.map((r) => resolveExam(ctx, r));
    await db.delete(examSchedule).where(and(eq(examSchedule.schoolId, schoolId), inArray(examSchedule.id, rows.map((r) => r.id))));
    await audit(req, 'delete', 'Sınav takvimi', null, `${rows.length} sınav silindi`);
    bus.contentChanged(schoolId);
    await tellTeachers(app.deps, schoolId, todayOf(school.timezone), resolved.map((exam) => ({ exam, what: 'removed' as const })));
    return { deleted: rows.length };
  });
}
