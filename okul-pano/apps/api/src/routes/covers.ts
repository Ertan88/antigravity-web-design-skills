import { classBell, dayBells, isInternshipSubject, monthSchema, trCompare, zonedParts } from '@okulpano/shared';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, schoolGuard, UUID_RE, type AppDeps } from '../context.ts';
import { classGroups, lessonCovers, schools, teacherLeaves, teachers, transportDuties } from '../db/schema.ts';
import { dutyDay, monthEnd, substituteCandidates, weekdayOf } from '../lib/dayinfo.ts';
import { badRequest, forbidden, notFound, parse } from '../lib/errors.ts';
import { loadExamContext } from '../lib/examSchedule.ts';
import { tell, usersForTeacher } from '../lib/push.ts';

/*
 * İzinli öğretmen yerine görevlendirme (A): günün boş kalan dersleri ve nöbet yerleri, her biri için o gün okulda olup
 * o saatte boş olan öğretmenler (nöbetçiler önce, "Nöbetçi" etiketiyle) ve tek dokunuşla atama. İstatistik: öğretmen
 * başına ay ve toplam ders saati; sınıf geçmişi ayrı. Öğretmen kendi görevlerini ve sayılarını görür.
 * Bilgi amaçlıdır (ek ders puantajı değildir). Okula özgü hiçbir sabit yoktur.
 */

const dateQuery = z.object({ date: z.iso.date().optional() });
const coverSchema = z.object({ date: z.iso.date(), periodNo: z.number().int().min(1).max(16), classGroupId: z.uuid(), teacherId: z.uuid() });

const trDay = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
type School = typeof schools.$inferSelect;

export interface CoverCandidate {
  teacherId: string;
  fullName: string;
  /** O gün nöbetçi */
  onDuty: boolean;
  /** Bu ay izinli yerine girdiği ders saati (adil dağıtım için) */
  monthCount: number;
}

/** Bir günün boş dersleri: onaylı izindeki öğretmenlerin o günkü dersleri (işletmede mesleki eğitim dersi hariç) */
async function coverDay(deps: AppDeps, school: School, date: string) {
  const { db } = deps;
  const ctx = await loadExamContext(db, school, date, date);
  const weekday = weekdayOf(date);
  const holiday = ctx.cal.holidays.find((h) => h.date === date)?.name ?? null;
  const [day, covers, monthRows, pendingLeaves] = await Promise.all([
    dutyDay(db, school.id, date),
    db.select().from(lessonCovers).where(and(eq(lessonCovers.schoolId, school.id), eq(lessonCovers.date, date))),
    db
      .select({ teacherId: lessonCovers.teacherId, n: sql<number>`count(*)::int` })
      .from(lessonCovers)
      .where(and(eq(lessonCovers.schoolId, school.id), gte(lessonCovers.date, `${date.slice(0, 7)}-01`), lte(lessonCovers.date, monthEnd(date.slice(0, 7)))))
      .groupBy(lessonCovers.teacherId),
    db
      .select({ teacherId: teacherLeaves.teacherId })
      .from(teacherLeaves)
      .where(and(eq(teacherLeaves.schoolId, school.id), eq(teacherLeaves.approvalStatus, 'pending'), lte(teacherLeaves.startDate, date), gte(teacherLeaves.endDate, date))),
  ]);
  const nameOf = (id: string | null) => (id ? (ctx.staff.find((t) => t.id === id)?.fullName ?? '') : '');
  const absent = new Set(ctx.leaves.filter((l) => l.startDate <= date && l.endDate >= date).map((l) => l.teacherId));
  const unavailable = new Set([...absent, ...pendingLeaves.map((l) => l.teacherId)]);
  const monthCount = new Map(monthRows.map((r) => [r.teacherId, r.n]));
  // O gün nöbetçi olanlar (izinli değilse) ve izinli yerine nöbete görevlendirilenler
  const onDuty = new Set([...day.entries.filter((e) => !e.onLeave).map((e) => e.teacherId), ...day.entries.flatMap((e) => (e.substitute ? [e.substitute.teacherId] : []))]);
  const lessonsToday = ctx.lessons.filter((l) => l.weekday === weekday);
  const activeIds = new Set((await db.select({ id: teachers.id }).from(teachers).where(and(eq(teachers.schoolId, school.id), eq(teachers.isActive, true)))).map((t) => t.id));
  const bells = holiday ? [] : dayBells(date, ctx.cal);

  // Dersin saati (sınıfa özel zil ve ikili öğretim dahil); "HH:MM" karşılaştırması için
  const shiftOf = (classGroupId: string) => (ctx.settings.dualShift && ctx.classes.find((c) => c.id === classGroupId)?.shift === 'afternoon' ? 'afternoon' : 'morning');
  const timeOf = (periodNo: number, classGroupId: string) => classBell(bells, classGroupId, shiftOf(classGroupId))?.periods.find((p) => p.no === periodNo) ?? null;
  // O gün okulda olduğu aralık: ilk dersinin başı ile son dersinin sonu (işletmede mesleki eğitim dersi okulda sayılmaz)
  const windows = new Map<string, { minNo: number; maxNo: number; start: string | null; end: string | null; timed: boolean }>();
  for (const l of lessonsToday) {
    if (!l.teacherId || isInternshipSubject(l.subject)) continue;
    const t = timeOf(l.periodNo, l.classGroupId);
    const w = windows.get(l.teacherId) ?? { minNo: l.periodNo, maxNo: l.periodNo, start: t?.start ?? null, end: t?.end ?? null, timed: true };
    w.minNo = Math.min(w.minNo, l.periodNo);
    w.maxNo = Math.max(w.maxNo, l.periodNo);
    if (!t) w.timed = false;
    else {
      if (!w.start || t.start < w.start) w.start = t.start;
      if (!w.end || t.end > w.end) w.end = t.end;
    }
    windows.set(l.teacherId, w);
  }
  /** Ders saati, öğretmenin o günkü ilk ve son dersinin arasında mı (okulda mı) */
  const inSchoolAt = (teacherId: string, periodNo: number, classGroupId: string) => {
    const w = windows.get(teacherId);
    if (!w) return false;
    const t = timeOf(periodNo, classGroupId);
    if (w.timed && w.start && w.end && t) return t.start >= w.start && t.end <= w.end;
    return periodNo > w.minNo && periodNo < w.maxNo;
  };

  /**
   * O ders saatine önerilenler: o gün okulda olan (nöbetçi ya da ilk ve son dersinin arasında boş saati olan),
   * izinli değil, o saatte dersi yok, başka bir boş derse görevli değil. Bütün günü boş olan öğretmen önerilmez.
   */
  const candidatesFor = (periodNo: number, classGroupId: string): CoverCandidate[] => {
    const teaching = new Set(lessonsToday.filter((l) => l.periodNo === periodNo && l.teacherId).map((l) => l.teacherId!));
    const covering = new Set(covers.filter((c) => c.periodNo === periodNo && c.classGroupId !== classGroupId).map((c) => c.teacherId));
    return ctx.staff
      .filter((t) => activeIds.has(t.id) && !unavailable.has(t.id) && !teaching.has(t.id) && !covering.has(t.id))
      .filter((t) => onDuty.has(t.id) || inSchoolAt(t.id, periodNo, classGroupId))
      .map((t) => ({ teacherId: t.id, fullName: t.fullName, onDuty: onDuty.has(t.id), monthCount: monthCount.get(t.id) ?? 0 }))
      .sort((a, b) => Number(b.onDuty) - Number(a.onDuty) || a.monthCount - b.monthCount || trCompare(a.fullName, b.fullName));
  };

  const slots = holiday
    ? []
    : lessonsToday
        .filter((l) => l.teacherId && absent.has(l.teacherId) && !isInternshipSubject(l.subject))
        // Aynı sınıf ve saatte birden çok kayıt (bölünmüş sınıf) tek satır
        .filter((l, i, all) => all.findIndex((x) => x.periodNo === l.periodNo && x.classGroupId === l.classGroupId) === i);
  const lessons = slots
    .map((l) => {
      const cls = ctx.classes.find((c) => c.id === l.classGroupId);
      const period = timeOf(l.periodNo, l.classGroupId);
      const cover = covers.find((c) => c.periodNo === l.periodNo && c.classGroupId === l.classGroupId);
      return {
        periodNo: l.periodNo,
        start: period?.start ?? null,
        end: period?.end ?? null,
        classGroupId: l.classGroupId,
        className: cls?.name ?? '',
        subject: l.subject,
        absentTeacherId: l.teacherId!,
        absentName: nameOf(l.teacherId),
        cover: cover ? { id: cover.id, teacherId: cover.teacherId, fullName: nameOf(cover.teacherId) } : null,
        candidates: cover ? [] : candidatesFor(l.periodNo, l.classGroupId),
      };
    })
    .sort((a, b) => a.periodNo - b.periodNo || trCompare(a.className, b.className));

  // Boş nöbet yerleri: o günün nöbetçileri önce ("Nöbetçi"), sonra o gün nöbeti olmayan ama dersi olan (okulda) öğretmenler
  const dutyGaps = day.holiday ? [] : day.entries.filter((e) => e.onLeave);
  const others = dutyGaps.some((g) => !g.substitute) ? await substituteCandidates(db, school.id, day, 200) : [];
  const busySubs = new Set(day.entries.flatMap((e) => (e.substitute ? [e.substitute.teacherId] : [])));
  const dutyCands: CoverCandidate[] = [
    ...day.entries
      .filter((e) => !e.onLeave && !unavailable.has(e.teacherId) && !busySubs.has(e.teacherId))
      .filter((e, i, all) => all.findIndex((x) => x.teacherId === e.teacherId) === i)
      .map((e) => ({ teacherId: e.teacherId, fullName: e.teacherName, onDuty: true, monthCount: monthCount.get(e.teacherId) ?? 0 })),
    ...others.filter((o) => !unavailable.has(o.teacherId) && windows.has(o.teacherId)).map((o) => ({ teacherId: o.teacherId, fullName: o.fullName, onDuty: false, monthCount: o.monthCount })),
  ];

  return {
    date,
    weekday,
    holiday,
    absent: [...absent].map((id) => ({ teacherId: id, fullName: nameOf(id) })).sort((a, b) => trCompare(a.fullName, b.fullName)),
    lessons,
    duties: dutyGaps.map((g) => ({
      dutyId: g.dutyId,
      area: g.area,
      absentName: g.teacherName,
      substitute: g.substitute,
      candidates: g.substitute ? [] : dutyCands,
    })),
  };
}

export async function coverRoutes(app: FastifyInstance) {
  const deps = app.deps;
  const { db } = deps;
  const base = '/api/schools/:schoolId';
  const member = { preHandler: [app.authenticate, schoolGuard()] };
  const manage = { preHandler: [app.authenticate, schoolGuard('duties.manage')] };
  const todayOf = (req: FastifyRequest) => zonedParts(new Date(), req.ctx.school.timezone).isoDate;

  /** Günün boş dersleri ve nöbet yerleri, adaylar (Genel Bakış kartı, mobil) */
  app.get(`${base}/cover-day`, manage, async (req) => {
    const { date } = parse(dateQuery, req.query);
    return coverDay(deps, req.ctx.school, date ?? todayOf(req));
  });

  /** Boş derse öğretmen gönder: o saatte boş olmalı; görevli öğretmene bildirim gider */
  app.post(`${base}/covers`, manage, async (req, reply) => {
    const body = parse(coverSchema, req.body);
    const day = await coverDay(deps, req.ctx.school, body.date);
    const slot = day.lessons.find((l) => l.periodNo === body.periodNo && l.classGroupId === body.classGroupId);
    if (!slot) throw badRequest('O gün o saatte izinli öğretmenin dersi yok.');
    if (slot.cover?.teacherId === body.teacherId) return slot.cover;
    // Yeni atamada aday listesinden; görevli değiştirilirken (liste boş) ayrıca bakılır
    const free = slot.cover ? await candidateFree(body) : slot.candidates.find((c) => c.teacherId === body.teacherId);
    if (!free) throw badRequest('Bu öğretmen o saatte boş değil (dersi var, izinli ya da başka bir derse görevli).');
    const [row] = await db
      .insert(lessonCovers)
      .values({
        schoolId: req.ctx.schoolId,
        date: body.date,
        periodNo: body.periodNo,
        classGroupId: body.classGroupId,
        absentTeacherId: slot.absentTeacherId,
        teacherId: body.teacherId,
        subject: slot.subject,
        createdBy: req.ctx.userId,
      })
      .onConflictDoUpdate({
        target: [lessonCovers.schoolId, lessonCovers.date, lessonCovers.periodNo, lessonCovers.classGroupId],
        set: { teacherId: body.teacherId, absentTeacherId: slot.absentTeacherId, subject: slot.subject, createdBy: req.ctx.userId },
      })
      .returning();
    await audit(req, 'create', 'Ders görevlendirmesi', row!.id, `${body.date} ${body.periodNo}. ders ${slot.className}`);
    await tell(deps, req.ctx.schoolId, await usersForTeacher(deps, req.ctx.schoolId, body.teacherId), {
      kind: 'lesson-cover',
      title: 'Derse görevlendirildiniz',
      body: `${trDay(body.date)} ${body.periodNo}. ders${slot.start ? ` (${slot.start})` : ''} · ${slot.className} ${slot.subject} · ${slot.absentName} yerine`,
      to: '/gorevlerim',
      url: '/gorevlerim',
    });
    return reply.status(201).send(row);

    /** Görevli değiştirilirken yeni öğretmen o saatte boş mu */
    async function candidateFree(b: z.infer<typeof coverSchema>) {
      const ctx = await loadExamContext(db, req.ctx.school, b.date, b.date);
      const weekday = weekdayOf(b.date);
      const teaching = ctx.lessons.some((l) => l.weekday === weekday && l.periodNo === b.periodNo && l.teacherId === b.teacherId);
      const onLeave = ctx.leaves.some((l) => l.teacherId === b.teacherId && l.startDate <= b.date && l.endDate >= b.date);
      const [other] = await db
        .select({ id: lessonCovers.id })
        .from(lessonCovers)
        .where(and(eq(lessonCovers.schoolId, req.ctx.schoolId), eq(lessonCovers.date, b.date), eq(lessonCovers.periodNo, b.periodNo), eq(lessonCovers.teacherId, b.teacherId)));
      const [t] = await db.select({ id: teachers.id }).from(teachers).where(and(eq(teachers.id, b.teacherId), eq(teachers.schoolId, req.ctx.schoolId), eq(teachers.isActive, true)));
      return t && !teaching && !onLeave && !other ? t : null;
    }
  });

  app.delete(`${base}/covers/:id`, manage, async (req) => {
    const id = (req.params as { id?: string }).id;
    if (!id || !UUID_RE.test(id)) throw notFound();
    const [row] = await db.delete(lessonCovers).where(and(eq(lessonCovers.id, id), eq(lessonCovers.schoolId, req.ctx.schoolId))).returning();
    if (!row) throw notFound();
    await audit(req, 'delete', 'Ders görevlendirmesi', id, `${row.date} ${row.periodNo}. ders`);
    return { ok: true };
  });

  /** Öğretmen başına izinli yerine girilen ders saati (ay ve toplam) */
  app.get(`${base}/cover-stats`, manage, async (req) => {
    const { month } = parse(z.object({ month: monthSchema.optional() }), req.query);
    const m = month ?? todayOf(req).slice(0, 7);
    const from = `${m}-01`;
    const to = monthEnd(m);
    const [staff, coverAll, coverMonth] = await Promise.all([
      db.select({ id: teachers.id, fullName: teachers.fullName, isActive: teachers.isActive }).from(teachers).where(eq(teachers.schoolId, req.ctx.schoolId)),
      countBy(lessonCovers, req.ctx.schoolId),
      countBy(lessonCovers, req.ctx.schoolId, from, to),
    ]);
    const rows = staff
      .map((t) => ({
        teacherId: t.id,
        fullName: t.fullName,
        month: coverMonth.get(t.id) ?? 0,
        total: coverAll.get(t.id) ?? 0,
        isActive: t.isActive,
      }))
      .filter((r) => r.isActive || r.total)
      .sort((a, b) => b.month - a.month || b.total - a.total || trCompare(a.fullName, b.fullName));
    return { month: m, rows };
  });

  /** Sınıf geçmişi: sınıf başına izinli yerine girilen ders sayısı; sınıf seçilince tek tek kayıtlar */
  app.get(`${base}/cover-history`, manage, async (req) => {
    const { classId } = parse(z.object({ classId: z.uuid().optional() }), req.query);
    if (!classId) {
      const rows = await db
        .select({ classGroupId: lessonCovers.classGroupId, className: classGroups.name, n: sql<number>`count(*)::int` })
        .from(lessonCovers)
        .innerJoin(classGroups, eq(classGroups.id, lessonCovers.classGroupId))
        .where(eq(lessonCovers.schoolId, req.ctx.schoolId))
        .groupBy(lessonCovers.classGroupId, classGroups.name);
      return { classes: rows.sort((a, b) => trCompare(a.className, b.className)), items: [] };
    }
    const rows = await db
      .select()
      .from(lessonCovers)
      .where(and(eq(lessonCovers.schoolId, req.ctx.schoolId), eq(lessonCovers.classGroupId, classId)))
      .orderBy(asc(lessonCovers.date), asc(lessonCovers.periodNo));
    const ids = [...new Set(rows.flatMap((r) => [r.teacherId, r.absentTeacherId].filter((x): x is string => Boolean(x))))];
    const names = new Map((ids.length ? await db.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers).where(inArray(teachers.id, ids)) : []).map((t) => [t.id, t.fullName]));
    return {
      classes: [],
      items: rows.reverse().map((r) => ({ id: r.id, date: r.date, periodNo: r.periodNo, subject: r.subject, teacherName: names.get(r.teacherId) ?? '', absentName: r.absentTeacherId ? (names.get(r.absentTeacherId) ?? '') : '' })),
    };
  });

  /** Öğretmenin kendi görevleri: ayın ders görevlendirmeleri, ay / toplam ders saati, taşımalı sayıları */
  app.get(`${base}/my-covers`, member, async (req) => {
    const { month } = parse(z.object({ month: monthSchema.optional() }), req.query);
    const teacherId = req.ctx.teacherId;
    if (!teacherId) throw forbidden('Hesabınız bir öğretmen kaydına bağlı değil.');
    const m = month ?? todayOf(req).slice(0, 7);
    const from = `${m}-01`;
    const to = monthEnd(m);
    const [items, total, transMonth, transTotal] = await Promise.all([
      db
        .select({ id: lessonCovers.id, date: lessonCovers.date, periodNo: lessonCovers.periodNo, subject: lessonCovers.subject, className: classGroups.name, absentTeacherId: lessonCovers.absentTeacherId })
        .from(lessonCovers)
        .innerJoin(classGroups, eq(classGroups.id, lessonCovers.classGroupId))
        .where(and(eq(lessonCovers.schoolId, req.ctx.schoolId), eq(lessonCovers.teacherId, teacherId), gte(lessonCovers.date, from), lte(lessonCovers.date, to)))
        .orderBy(asc(lessonCovers.date), asc(lessonCovers.periodNo)),
      countBy(lessonCovers, req.ctx.schoolId, undefined, undefined, teacherId),
      countBy(transportDuties, req.ctx.schoolId, from, to, teacherId),
      countBy(transportDuties, req.ctx.schoolId, undefined, undefined, teacherId),
    ]);
    const ids = [...new Set(items.map((i) => i.absentTeacherId).filter((x): x is string => Boolean(x)))];
    const names = new Map((ids.length ? await db.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers).where(inArray(teachers.id, ids)) : []).map((t) => [t.id, t.fullName]));
    return {
      month: m,
      today: todayOf(req),
      monthCount: items.length,
      total: total.get(teacherId) ?? 0,
      transportMonth: transMonth.get(teacherId) ?? 0,
      transportTotal: transTotal.get(teacherId) ?? 0,
      items: items.map(({ absentTeacherId, ...i }) => ({ ...i, absentName: absentTeacherId ? (names.get(absentTeacherId) ?? '') : '' })),
    };
  });

  /** Öğretmen başına kayıt sayısı (tarih aralığı ve öğretmen isteğe bağlı) */
  async function countBy(table: typeof lessonCovers | typeof transportDuties, schoolId: string, from?: string, to?: string, teacherId?: string) {
    const where = [eq(table.schoolId, schoolId)];
    if (from) where.push(gte(table.date, from));
    if (to) where.push(lte(table.date, to));
    if (teacherId) where.push(eq(table.teacherId, teacherId));
    const rows = await db
      .select({ teacherId: table.teacherId, n: sql<number>`count(*)::int` })
      .from(table)
      .where(and(...where))
      .groupBy(table.teacherId);
    return new Map(rows.map((r) => [r.teacherId, r.n]));
  }
}
