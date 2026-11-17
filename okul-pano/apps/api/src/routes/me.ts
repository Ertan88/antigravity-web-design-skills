import { bellClassDays, joinClassNames, responsibleFor, leaveRequestSchema, lessonCounts, nextSchoolDay, normalizeName, pushTokenSchema, schoolSettingsSchema, zonedParts, type SchoolCalendar } from '@okulpano/shared';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessUser, audit, schoolGuard } from '../context.ts';
import { bellOverrides, bellSchedules, classGroups, examReminderAcks, examSchedule, pushTokens, teacherLeaves, teachers, timetableEntries, users } from '../db/schema.ts';
import { addDays, dutyDay, dutyScheduleStatus, effectiveHolidays, holidaysAndHalfDays, monthEnd, teacherDutyDays } from '../lib/dayinfo.ts';
import { badRequest, notFound, parse } from '../lib/errors.ts';
import { notifyUsers, usersWithPermission } from '../lib/push.ts';
import { teacherCovers } from './covers.ts';
import { tell } from './issues.ts';
import { notifyCoverNeed } from '../lib/responsibility.ts';

/**
 * Mobil uygulamanın "benim" uç noktaları: öğretmenin günü (ders programı, nöbetleri), izin bildirimi
 * ve telefon bildirimleri için cihaz kaydı.
 */
/** Bildirim metni için "20 Kasım" ya da "20 – 21 Kasım" */
const trDay = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const trRange = (a: string, b: string) => (a === b ? trDay(a) : `${trDay(a)} – ${trDay(b)}`);

export async function meRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const member = { preHandler: [app.authenticate, schoolGuard()] };

  /** Öğretmenin bir haftası: bugünün ve önümüzdeki 7 günün nöbetleri, haftalık ders programı, zil çizelgeleri */
  app.get('/api/schools/:schoolId/me/today', member, async (req) => {
    const { schoolId, school, teacherId } = req.ctx;
    const today = zonedParts(new Date(), school.timezone).isoDate;
    const settings = schoolSettingsSchema.parse(school.settings ?? {});
    const [teacher] = teacherId
      ? await db.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers).where(eq(teachers.id, teacherId))
      : [];
    const dates = Array.from({ length: 8 }, (_, i) => addDays(today, i));

    const [bells, holidays, lessons, leaves, days, allLessons, classRows, overrideRows, covers] = await Promise.all([
      db.select().from(bellSchedules).where(eq(bellSchedules.schoolId, schoolId)).orderBy(asc(bellSchedules.sortOrder)),
      holidaysAndHalfDays(db, schoolId, today, addDays(today, 21)),
      teacher
        ? db
            .select({ weekday: timetableEntries.weekday, periodNo: timetableEntries.periodNo, className: classGroups.name, classId: classGroups.id, shift: classGroups.shift, subject: timetableEntries.subject })
            .from(timetableEntries)
            .innerJoin(classGroups, eq(classGroups.id, timetableEntries.classGroupId))
            .where(and(eq(timetableEntries.schoolId, schoolId), eq(timetableEntries.teacherId, teacher.id)))
            .orderBy(asc(timetableEntries.weekday), asc(timetableEntries.periodNo))
        : Promise.resolve([]),
      teacher
        ? db
            .select()
            .from(teacherLeaves)
            .where(and(eq(teacherLeaves.schoolId, schoolId), eq(teacherLeaves.teacherId, teacher.id), gte(teacherLeaves.endDate, today)))
            .orderBy(asc(teacherLeaves.startDate))
        : Promise.resolve([]),
      teacher ? Promise.all(dates.map((d) => dutyDay(db, schoolId, d))) : Promise.resolve([]),
      // Günün ders sayısı (zil düzeni seçimi) bütün okulun programından
      db
        .select({ weekday: timetableEntries.weekday, periodNo: timetableEntries.periodNo, classGroupId: timetableEntries.classGroupId })
        .from(timetableEntries)
        .where(eq(timetableEntries.schoolId, schoolId)),
      db.select({ id: classGroups.id, bellExempt: classGroups.bellExempt, shift: classGroups.shift }).from(classGroups).where(eq(classGroups.schoolId, schoolId)),
      db
        .select({ date: bellOverrides.date, target: bellOverrides.target, periods: bellOverrides.periods, note: bellOverrides.note })
        .from(bellOverrides)
        .where(and(eq(bellOverrides.schoolId, schoolId), gte(bellOverrides.date, today), lte(bellOverrides.date, addDays(today, 21)))),
      // İzinli öğretmen yerine görevlendirildiği dersler (bugünden bir hafta)
      teacher ? teacherCovers(db, schoolId, teacher.id, today, addDays(today, 7)) : Promise.resolve([]),
    ]);
    const cal: SchoolCalendar = {
      schedules: bells.map((b) => ({ ...b, classIds: b.classIds ?? null })),
      holidays: holidays.holidays,
      halfDays: holidays.halfDays,
      halfDayEnd: settings.halfDayEnd,
      lessonCounts: allLessons.length ? lessonCounts(allLessons, classRows, settings.dualShift) : null,
      bellClasses: bellClassDays(allLessons, classRows),
      overrides: overrideRows,
      dualShift: settings.dualShift,
    };

    const week = days.map((day) => {
      const mine = day.holiday
        ? []
        : day.entries.flatMap((e) => {
            const own = e.teacherId === teacher!.id;
            const covering = e.substitute?.teacherId === teacher!.id;
            if (!own && !covering) return [];
            const partners = day.entries
              .filter((o) => o.dutyId !== e.dutyId && normalizeName(o.area) === normalizeName(e.area))
              .map((o) => o.substitute?.teacherName ?? o.teacherName);
            return [
              {
                dutyId: e.dutyId,
                area: e.area,
                partners,
                // Başkasının yerine görevli
                substituteFor: covering ? e.teacherName : null,
                // Kendi nöbetini (izin nedeniyle) başkası tutuyor
                coveredBy: own && e.substitute ? e.substitute.teacherName : null,
              },
            ];
          });
      return { date: day.date, weekday: day.weekday, holiday: day.holiday, supervisor: day.supervisor, duties: mine };
    });

    return {
      teacher: teacher ?? null,
      today,
      timezone: school.timezone,
      lunchThresholdMin: settings.lunchThresholdMin,
      bellSchedules: bells.map((b) => ({ id: b.id, name: b.name, weekdays: b.weekdays, periods: b.periods, sortOrder: b.sortOrder, lessonCount: b.lessonCount, shift: b.shift, classIds: b.classIds ?? null })),
      /** İkili öğretim: her dersin vardiyası (`lessons[].shift`) kendi zilini belirler */
      dualShift: settings.dualShift,
      /** Günün ders sayısı: "<vardiya>:<gün>" → en geç biten sınıfın son dersi */
      lessonCounts: allLessons.length ? lessonCounts(allLessons, classRows, settings.dualShift) : null,
      /** Sınıfların gün gün ders sayıları: sınıfa özel zil (ör. 12. sınıfların 11 dersli günü) bundan seçilir */
      bellClasses: bellClassDays(allLessons, classRows),
      /** Zil saatlerine elle müdahaleler (bugünden üç hafta) */
      bellOverrides: overrideRows,
      holidays: holidays.holidays,
      /** Arifeler: dersler halfDayEnd saatinde biter */
      halfDays: holidays.halfDays,
      halfDayEnd: settings.halfDayEnd,
      lessons: mergeLessons(lessons),
      /** İzinli yerine girilecek dersler (tarihe bağlı; o günün ders listesine "GÖREV" olarak eklenir) */
      covers: covers.map((c) => ({ date: c.date, periodNo: c.periodNo, classId: c.classId, className: c.className, shift: c.shift, subject: c.subject, absentName: c.absentName })),
      /** Sonraki okul günü (gün bitince "Yarın" bilgisi için) */
      nextSchoolDay: nextSchoolDay(today, cal, 21)?.date ?? null,
      leaves: leaves.map((l) => ({ id: l.id, startDate: l.startDate, endDate: l.endDate, note: l.note, status: l.approvalStatus })),
      week,
    };
  });

  /**
   * Öğretmenin bu ayki nöbetleri (bugünden ay sonuna): okul içi nöbet yerleri, taşımalı öğrenci görevleri
   * (servis, öğle yemeği), birlikte nöbetçi olanlar ve o günlerin nöbetçi müdür yardımcısı. Ayın çizelgesi
   * girilmemişse (son girilen ayınki gösterilir) ve ay sonu yaklaşırken yeni ay girilmemişse bildirilir.
   */
  app.get('/api/schools/:schoolId/me/duties', member, async (req) => {
    const { schoolId, school, teacherId, role, userId } = req.ctx;
    const today = zonedParts(new Date(), school.timezone).isoDate;
    const month = today.slice(0, 7);
    const end = monthEnd(month);
    // Kadroda olmayan (dersi olmayan) müdür ve müdür yardımcısı: nöbetçi yönetici günleri hesaptaki ada göre
    const [account] = !teacherId && (role === 'owner' || role === 'admin') ? await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId)) : [];
    const name = account?.fullName;
    const hasDuties = Boolean(teacherId || name);
    const nextMonth = addDays(end, 1).slice(0, 7);
    const transport = schoolSettingsSchema.parse(school.settings ?? {}).hasTransport;
    const monthStart = `${month}-01`;
    const [current, next, wholeMonth] = await Promise.all([
      dutyScheduleStatus(db, schoolId, month),
      dutyScheduleStatus(db, schoolId, nextMonth),
      hasDuties ? teacherDutyDays(db, schoolId, teacherId, monthStart, end, { transport, name }) : Promise.resolve([]),
    ]);
    const thisMonth = wholeMonth.filter((d) => d.date >= today);
    // Bu ay kalan nöbet yoksa ve gelecek ayın çizelgesi girildiyse gelecek ayın nöbetleri gösterilir
    const remaining = thisMonth.some((d) => !d.holiday);
    const showNext = hasDuties && !remaining && next.entered;
    const showing = showNext ? nextMonth : month;
    const monthDays = showNext ? await teacherDutyDays(db, schoolId, teacherId, addDays(end, 1), monthEnd(nextMonth), { transport, name }) : wholeMonth;
    const [[teacher], holidays] = await Promise.all([
      teacherId ? db.select({ fullName: teachers.fullName }).from(teachers).where(eq(teachers.id, teacherId)) : Promise.resolve([]),
      effectiveHolidays(db, schoolId, `${showing}-01`, monthEnd(showing)),
    ]);
    return {
      today,
      month,
      /** Listelenen ay: bu ay ya da (bu ay kalan nöbet yoksa) gelecek ay */
      showing,
      /** Okulda taşımalı eğitim açık mı (kapalıysa taşımalı görevler gösterilmez) */
      hasTransport: transport,
      schedule: current,
      // Ayın son haftasında yeni ayın çizelgesi henüz girilmemişse uyarı gösterilir
      nextMonth: { ...next, soon: addDays(today, 7) > end },
      /** Ay şeridi: gösterilen ayın bütün görev günleri (geçmişler dahil) ve tatilleri */
      calendar: {
        marks: monthDays.filter((d) => !d.holiday).map((d) => ({ date: d.date, duty: d.duties.length > 0, transport: Boolean(d.transport) })),
        holidays,
      },
      teacher: Boolean(teacherId),
      /** Öğretmen kaydındaki ad (taşımalı ve öğle yemeği nöbetinde 1. nöbetçi) */
      teacherName: teacher?.fullName ?? null,
      /** Liste: bugünden sonraki görev günleri */
      days: showNext ? monthDays : thisMonth,
    };
  });

  /** Öğretmen kendi iznini bildirir: izin yetkisi yoksa yöneticinin onayına düşer */
  app.post('/api/schools/:schoolId/me/leaves', member, async (req, reply) => {
    const { teacherId, schoolId, permissions, userId } = req.ctx;
    if (!teacherId) throw badRequest('Hesabınız bir öğretmen kaydına bağlı değil. Okul yöneticinizden hesabınızı öğretmen kaydınızla eşleştirmesini isteyin.');
    const body = parse(leaveRequestSchema, req.body);
    // Kişi kendi iznini onaylamaz: izin yetkisi olan başka biri varsa onaya düşer. Onaylayacak başka kimse yoksa
    // doğrudan geçerli olur. Okul müdürünün izni okulda onaylanmaz (üst makam il/ilçe MEM'dir): yöneticilerin
    // onayına düşmez, doğrudan geçerli olur; ders görevlendirme bildirimi o günün nöbetçi müdür yardımcısına gider.
    const eligible = (await usersWithPermission(app.deps, schoolId, 'leaves.manage')).filter((id) => id !== userId);
    // Görev dağılımında izinlerin sorumlusu seçildiyse yalnızca ona gider
    const approvers = req.ctx.role === 'owner' ? [] : responsibleFor(req.ctx.school.settings?.responsibilities?.leaves, eligible);
    const autoApprove = req.ctx.role === 'owner' || (permissions.includes('leaves.manage') && approvers.length === 0);
    const [row] = await db
      .insert(teacherLeaves)
      .values({
        schoolId,
        teacherId,
        startDate: body.startDate,
        endDate: body.endDate,
        note: body.note?.trim() || null,
        approvalStatus: autoApprove ? 'approved' : 'pending',
        requestedBy: userId,
      })
      .returning();
    const [t] = await db.select({ fullName: teachers.fullName }).from(teachers).where(eq(teachers.id, teacherId));
    await audit(req, 'create', 'İzin bildirimi', row!.id, `${t?.fullName ?? ''} · ${body.startDate} – ${body.endDate}`);
    if (autoApprove) {
      bus.contentChanged(schoolId);
      await notifyCoverNeed(app.deps, schoolId, req.ctx.school.settings, zonedParts(new Date(), req.ctx.school.timezone).isoDate, { teacherName: t?.fullName ?? '', startDate: body.startDate, endDate: body.endDate }, (ids, n) => tell(app.deps, ids, n));
    } else {
      // Bildirim kutusunda onay bekleyen izin olarak görünür (notifications.ts); telefona da gönderilir
      notifyUsers(app.deps, approvers, {
        title: 'İzin bildirimi',
        body: `${t?.fullName ?? 'Bir öğretmen'} ${trRange(body.startDate, body.endDate)} için izin bildirdi.`,
        url: '/onaylar',
      });
    }
    return reply.status(201).send(row);
  });

  app.get('/api/schools/:schoolId/me/leaves', member, async (req) => {
    if (!req.ctx.teacherId) return [];
    return db
      .select()
      .from(teacherLeaves)
      .where(and(eq(teacherLeaves.schoolId, req.ctx.schoolId), eq(teacherLeaves.teacherId, req.ctx.teacherId)))
      .orderBy(desc(teacherLeaves.startDate))
      .limit(30);
  });

  /**
   * Öğretmen kendi izin bildirimini geri alır: onay bekleyen her zaman, onaylanmış ya da reddedilmiş ise bitmemişse.
   * Geçmiş izinler kayıt olarak kalır. Onaylı izin geri alınınca pano güncellenir ve izin yöneticileri bilgilendirilir.
   */
  app.delete('/api/schools/:schoolId/me/leaves/:id', member, async (req, reply) => {
    const { teacherId, schoolId, school } = req.ctx;
    const { id } = req.params as { id: string };
    if (!teacherId) throw notFound();
    const [row] = await db
      .select()
      .from(teacherLeaves)
      .where(and(eq(teacherLeaves.id, id), eq(teacherLeaves.schoolId, schoolId), eq(teacherLeaves.teacherId, teacherId)));
    if (!row) throw notFound('İzin bulunamadı.');
    const today = zonedParts(new Date(), school.timezone).isoDate;
    if (row.approvalStatus !== 'pending' && row.endDate < today) throw badRequest('Geçmiş izinler silinemez; kayıt olarak saklanır.');
    await db.delete(teacherLeaves).where(eq(teacherLeaves.id, id));
    const [t] = await db.select({ fullName: teachers.fullName }).from(teachers).where(eq(teachers.id, teacherId));
    const when = trRange(row.startDate, row.endDate);
    await audit(req, 'delete', 'İzin bildirimi', id, `${t?.fullName ?? ''} · ${row.startDate} – ${row.endDate}`);
    if (row.approvalStatus === 'approved') {
      bus.contentChanged(schoolId);
      const approvers = responsibleFor(req.ctx.school.settings?.responsibilities?.leaves, (await usersWithPermission(app.deps, schoolId, 'leaves.manage')).filter((u) => u !== req.ctx.userId));
      await tell(app.deps, approvers, {
        kind: 'leave-withdrawn',
        title: 'İzin geri alındı',
        body: `${t?.fullName ?? 'Bir öğretmen'} ${when} iznini geri aldı.`,
        to: '/izinler',
        schoolId,
      });
    }
    return reply.status(204).send();
  });

  /* ---------- Telefon bildirimleri ---------- */

  app.post('/api/me/push-tokens', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub } = accessUser(req);
    const body = parse(pushTokenSchema, req.body);
    // Aynı telefon birden fazla hesaba bağlanabilir (hızlı hesap geçişi); hesap kaldırılınca yalnızca onunki silinir
    await db
      .insert(pushTokens)
      .values({ userId: sub, token: body.token, platform: body.platform })
      .onConflictDoUpdate({ target: [pushTokens.token, pushTokens.userId], set: { platform: body.platform } });
    return reply.status(204).send();
  });

  /**
   * Telefon, sınav hatırlatmalarını kendinde kurduğunu bildirir (her kurulumda listenin tamamı). Sunucu bu
   * telefonlara aynı hatırlatmayı ayrıca göndermez; bildirmeyenlere teneffüs başında kendisi gönderir.
   */
  app.post('/api/me/exam-reminders', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub } = accessUser(req);
    const body = parse(
      z.object({ token: z.string().min(10).max(500), items: z.array(z.object({ examId: z.uuid(), notifyAt: z.iso.datetime({ offset: true }) })).max(60) }),
      req.body,
    );
    const [own] = await db.select({ id: pushTokens.id }).from(pushTokens).where(and(eq(pushTokens.token, body.token), eq(pushTokens.userId, sub)));
    if (!own) return reply.status(204).send();
    await db.delete(examReminderAcks).where(eq(examReminderAcks.token, body.token));
    const ids = [...new Set(body.items.map((i) => i.examId))];
    const existing = ids.length ? new Set((await db.select({ id: examSchedule.id }).from(examSchedule).where(inArray(examSchedule.id, ids))).map((r) => r.id)) : new Set<string>();
    const rows = body.items.filter((i) => existing.has(i.examId)).map((i) => ({ token: body.token, examId: i.examId, notifyAt: new Date(i.notifyAt) }));
    if (rows.length) await db.insert(examReminderAcks).values(rows).onConflictDoNothing();
    return reply.status(204).send();
  });

  app.delete('/api/me/push-tokens', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub } = accessUser(req);
    const { token } = parse(z.object({ token: z.string().min(10).max(500) }), req.body);
    await db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.userId, sub)));
    return reply.status(204).send();
  });
}

/** Aynı saatte birleştirilmiş sınıflar tek ders: "AMP 11-ACM · Rehberlik ve Yönlendirme" */
function mergeLessons<T extends { weekday: number; periodNo: number; className: string; subject: string }>(rows: T[]): T[] {
  const byKey = new Map<string, { row: T; names: string[] }>();
  for (const r of rows) {
    const key = `${r.weekday}-${r.periodNo}-${r.subject}`;
    const hit = byKey.get(key);
    if (hit) hit.names.push(r.className);
    else byKey.set(key, { row: r, names: [r.className] });
  }
  return [...byKey.values()].map(({ row, names }) => ({ ...row, className: joinClassNames(names) }));
}
