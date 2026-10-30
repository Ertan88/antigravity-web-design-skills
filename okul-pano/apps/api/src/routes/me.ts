import { leaveRequestSchema, normalizeName, pushTokenSchema, schoolSettingsSchema, zonedParts } from '@okulpano/shared';
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessUser, audit, schoolGuard } from '../context.ts';
import { bellSchedules, classGroups, pushTokens, teacherLeaves, teachers, timetableEntries } from '../db/schema.ts';
import { addDays, dutyDay, dutyScheduleStatus, effectiveHolidays, holidaysAndHalfDays, monthEnd, teacherDutyDays } from '../lib/dayinfo.ts';
import { badRequest, parse } from '../lib/errors.ts';
import { notifyUsers, usersWithPermission } from '../lib/push.ts';

/**
 * Mobil uygulamanın "benim" uç noktaları: öğretmenin günü (ders programı, nöbetleri), izin bildirimi
 * ve telefon bildirimleri için cihaz kaydı.
 */
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

    const [bells, holidays, lessons, leaves, days] = await Promise.all([
      db.select().from(bellSchedules).where(eq(bellSchedules.schoolId, schoolId)).orderBy(asc(bellSchedules.sortOrder)),
      holidaysAndHalfDays(db, schoolId, today, addDays(today, 21)),
      teacher
        ? db
            .select({ weekday: timetableEntries.weekday, periodNo: timetableEntries.periodNo, className: classGroups.name, subject: timetableEntries.subject })
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
    ]);

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
      bellSchedules: bells.map((b) => ({ id: b.id, name: b.name, weekdays: b.weekdays, periods: b.periods, sortOrder: b.sortOrder })),
      holidays: holidays.holidays,
      /** Arifeler: dersler halfDayEnd saatinde biter */
      halfDays: holidays.halfDays,
      halfDayEnd: settings.halfDayEnd,
      lessons,
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
    const { schoolId, school, teacherId } = req.ctx;
    const today = zonedParts(new Date(), school.timezone).isoDate;
    const month = today.slice(0, 7);
    const end = monthEnd(month);
    const nextMonth = addDays(end, 1).slice(0, 7);
    const transport = schoolSettingsSchema.parse(school.settings ?? {}).hasTransport;
    const monthStart = `${month}-01`;
    const [current, next, wholeMonth] = await Promise.all([
      dutyScheduleStatus(db, schoolId, month),
      dutyScheduleStatus(db, schoolId, nextMonth),
      teacherId ? teacherDutyDays(db, schoolId, teacherId, monthStart, end, { transport }) : Promise.resolve([]),
    ]);
    const thisMonth = wholeMonth.filter((d) => d.date >= today);
    // Bu ay kalan nöbet yoksa ve gelecek ayın çizelgesi girildiyse gelecek ayın nöbetleri gösterilir
    const remaining = thisMonth.some((d) => !d.holiday);
    const showNext = Boolean(teacherId) && !remaining && next.entered;
    const showing = showNext ? nextMonth : month;
    const monthDays = showNext ? await teacherDutyDays(db, schoolId, teacherId!, addDays(end, 1), monthEnd(nextMonth), { transport }) : wholeMonth;
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
    const autoApprove = permissions.includes('leaves.manage');
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
    if (autoApprove) bus.contentChanged(schoolId);
    else {
      notifyUsers(app.deps, await usersWithPermission(app.deps, schoolId, 'leaves.manage'), {
        title: 'İzin bildirimi',
        body: `${t?.fullName ?? 'Bir öğretmen'} ${body.startDate === body.endDate ? body.startDate : `${body.startDate} – ${body.endDate}`} için izin bildirdi.`,
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

  /* ---------- Telefon bildirimleri ---------- */

  app.post('/api/me/push-tokens', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub } = accessUser(req);
    const body = parse(pushTokenSchema, req.body);
    // Aynı telefon başka hesapla açılırsa anahtar yeni kullanıcıya geçer
    await db
      .insert(pushTokens)
      .values({ userId: sub, token: body.token, platform: body.platform })
      .onConflictDoUpdate({ target: pushTokens.token, set: { userId: sub, platform: body.platform } });
    return reply.status(204).send();
  });

  app.delete('/api/me/push-tokens', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub } = accessUser(req);
    const { token } = parse(z.object({ token: z.string().min(10).max(300) }), req.body);
    await db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.userId, sub)));
    return reply.status(204).send();
  });
}
