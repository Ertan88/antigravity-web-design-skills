import { bellClassDays, joinClassNames, leaveRequestSchema, lessonCounts, normalizeName, pushTokenSchema, schoolSettingsSchema, zonedParts } from '@okulpano/shared';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessUser, audit, schoolGuard } from '../context.ts';
import { bellOverrides, bellSchedules, classGroups, pushTokens, teacherLeaves, teachers, timetableEntries } from '../db/schema.ts';
import { addDays, dutyDay, dutyScheduleStatus, effectiveHolidays, holidaysAndHalfDays, monthEnd, teacherDutyDays } from '../lib/dayinfo.ts';
import { badRequest, notFound, parse } from '../lib/errors.ts';
import { notifyUsers, usersWithPermission } from '../lib/push.ts';

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

    const [bells, holidays, lessons, leaves, days, allLessons, classRows, overrideRows] = await Promise.all([
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
      notifyUsers(app.deps, await usersWithPermission(app.deps, schoolId, 'leaves.manage'), {
        title: 'İzin geri alındı',
        body: `${t?.fullName ?? 'Bir öğretmen'} ${when} iznini geri aldı.`,
        url: '/izinler',
      });
    }
    return reply.status(204).send();
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
