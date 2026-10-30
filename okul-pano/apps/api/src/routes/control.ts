import { dutySubstitutionSchema, zonedParts, type Permission } from '@okulpano/shared';
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import { announcements, duties, dutySubstitutions, screens, teacherLeaves, teachers, users } from '../db/schema.ts';
import { addDays, dutyDay, dutyGaps, dutyScheduleStatus, substituteCandidates, weekdayOf } from '../lib/dayinfo.ts';
import { badRequest, forbidden, notFound, parse } from '../lib/errors.ts';
import { notifyUsers, usersForTeacher } from '../lib/push.ts';

const dateQuery = z.object({ date: z.iso.date().optional() });

/** İzinlerden herhangi biri yeterli (ör. uzaktan komut: pano yönetimi ya da ekranlar) */
function anyOf(...perms: Permission[]) {
  return async (req: FastifyRequest) => {
    if (!perms.some((p) => req.ctx.permissions.includes(p))) throw forbidden();
  };
}

/**
 * Mobil uygulamanın yönetici ekranları ve panel: nöbet boşlukları ve yerine görevlendirme, kontrol merkezi özeti.
 */
export async function controlRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const member = { preHandler: [app.authenticate, schoolGuard()] };
  const control = { preHandler: [app.authenticate, schoolGuard(), anyOf('board.control')] };
  const schedule = { preHandler: [app.authenticate, schoolGuard('schedule.manage')] };
  const dutyWrite = { preHandler: [app.authenticate, schoolGuard('duties.manage')] };
  const todayOf = (req: FastifyRequest) => zonedParts(new Date(), req.ctx.school.timezone);

  /* ---------- Nöbet günü: kim nerede, boş yerler, yerine görevlendirme ---------- */

  /** Bir günün nöbet yerleri, boş yerler ve (görevlendirme yetkisi olana) öneriler */
  async function dayView(req: FastifyRequest, iso: string) {
    const [day, schedule] = await Promise.all([dutyDay(db, req.ctx.schoolId, iso), dutyScheduleStatus(db, req.ctx.schoolId, iso.slice(0, 7))]);
    const canAssign = req.ctx.permissions.includes('duties.manage');
    // Onay bekleyen izin talepleri yalnızca izin ya da nöbet yetkisi olanlara görünür
    const seesRequests = canAssign || req.ctx.permissions.includes('leaves.manage');
    return {
      ...day,
      // Ayın çizelgesi girilmemişse son girilen ayınki gösterilir; ekranda not düşülür
      schedule,
      entries: seesRequests ? day.entries : day.entries.map((e) => ({ ...e, leavePending: false })),
      gaps: dutyGaps(day).map((g) => g.dutyId),
      // Öneriler yalnızca görevlendirme yapabilenlere (ve boş yer varken) hesaplanır
      candidates: canAssign && dutyGaps(day).length ? await substituteCandidates(db, req.ctx.schoolId, day) : [],
    };
  }

  app.get('/api/schools/:schoolId/duty-day', member, async (req) => {
    const { date } = parse(dateQuery, req.query);
    return dayView(req, date ?? todayOf(req).isoDate);
  });

  /** Haftanın iş günleri (Pazartesi–Cuma): verilen tarihin haftası; mobilde "Kim nerede" gün şeridi */
  app.get('/api/schools/:schoolId/duty-week', member, async (req) => {
    const { date } = parse(dateQuery, req.query);
    const iso = date ?? todayOf(req).isoDate;
    const monday = addDays(iso, 1 - weekdayOf(iso));
    return { start: monday, days: await Promise.all([0, 1, 2, 3, 4].map((i) => dayView(req, addDays(monday, i)))) };
  });

  app.post('/api/schools/:schoolId/duty-substitutions', dutyWrite, async (req, reply) => {
    const body = parse(dutySubstitutionSchema, req.body);
    const [duty] = await db
      .select({ id: duties.id, area: duties.area })
      .from(duties)
      .where(and(eq(duties.id, body.dutyId), eq(duties.schoolId, req.ctx.schoolId)));
    const [teacher] = await db
      .select({ id: teachers.id, fullName: teachers.fullName })
      .from(teachers)
      .where(and(eq(teachers.id, body.teacherId), eq(teachers.schoolId, req.ctx.schoolId)));
    if (!duty || !teacher) throw badRequest('Nöbet ya da öğretmen bu okula ait değil.');
    const [row] = await db
      .insert(dutySubstitutions)
      .values({ schoolId: req.ctx.schoolId, date: body.date, dutyId: body.dutyId, teacherId: body.teacherId, createdBy: req.ctx.userId })
      .onConflictDoUpdate({
        target: [dutySubstitutions.schoolId, dutySubstitutions.date, dutySubstitutions.dutyId],
        set: { teacherId: body.teacherId, createdBy: req.ctx.userId },
      })
      .returning();
    await audit(req, 'create', 'Nöbet görevlendirme', row!.id, `${body.date} · ${duty.area} · ${teacher.fullName}`);
    bus.contentChanged(req.ctx.schoolId);
    notifyUsers(app.deps, await usersForTeacher(app.deps, req.ctx.schoolId, teacher.id), {
      title: 'Nöbet görevlendirmesi',
      body: `${trDay(body.date)} ${duty.area} nöbetine görevlendirildiniz.`,
      url: '/nobet',
    });
    return reply.status(201).send(row);
  });

  app.delete('/api/schools/:schoolId/duty-substitutions/:id', dutyWrite, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const [row] = await db
      .delete(dutySubstitutions)
      .where(and(eq(dutySubstitutions.id, id), eq(dutySubstitutions.schoolId, req.ctx.schoolId)))
      .returning();
    if (!row) throw notFound();
    await audit(req, 'delete', 'Nöbet görevlendirme', id, row.date);
    bus.contentChanged(req.ctx.schoolId);
    return reply.status(204).send();
  });

  /* ---------- Kontrol merkezi (yöneticinin ana ekranı) ---------- */

  app.get('/api/schools/:schoolId/control-center', member, async (req) => {
    const { schoolId, permissions } = req.ctx;
    const today = todayOf(req);
    const now = new Date();
    const endOfDay = new Date(now.getTime() + (86400 - today.secondsOfDay) * 1000);
    const onAirWhere = and(
      eq(announcements.schoolId, schoolId),
      eq(announcements.isActive, true),
      eq(announcements.approvalStatus, 'approved'),
      or(isNull(announcements.endsAt), gt(announcements.endsAt, now)),
      or(isNull(announcements.startsAt), lte(announcements.startsAt, now)),
    );
    const [screenRows, [pendingAnn], [pendingLeaves], [onAir], endingToday, day] = await Promise.all([
      db.select({ id: screens.id, name: screens.name, lastSeenAt: screens.lastSeenAt }).from(screens).where(eq(screens.schoolId, schoolId)).orderBy(asc(screens.name)),
      db
        .select({ n: count() })
        .from(announcements)
        .where(and(eq(announcements.schoolId, schoolId), eq(announcements.approvalStatus, 'pending'))),
      db
        .select({ n: count() })
        .from(teacherLeaves)
        .where(and(eq(teacherLeaves.schoolId, schoolId), eq(teacherLeaves.approvalStatus, 'pending'))),
      db.select({ n: count() }).from(announcements).where(onAirWhere),
      db
        .select({ id: announcements.id, title: announcements.title, endsAt: announcements.endsAt })
        .from(announcements)
        .where(and(onAirWhere, lte(announcements.endsAt, endOfDay)))
        .orderBy(asc(announcements.endsAt)),
      dutyDay(db, schoolId, today.isoDate),
    ]);
    const screensOut = screenRows.map((s) => ({ ...s, online: bus.isOnline(s.id) }));
    return {
      today: today.isoDate,
      emergency: req.ctx.school.emergency ?? null,
      screens: { total: screensOut.length, online: screensOut.filter((s) => s.online).length, offline: screensOut.filter((s) => !s.online) },
      pending: {
        announcements: permissions.includes('announcements.approve') ? (pendingAnn?.n ?? 0) : 0,
        leaves: permissions.includes('leaves.manage') ? (pendingLeaves?.n ?? 0) : 0,
      },
      onAir: onAir?.n ?? 0,
      endingToday,
      dutyGaps: dutyGaps(day).map((g) => ({ dutyId: g.dutyId, area: g.area, teacherName: g.teacherName })),
      holiday: day.holiday,
    };
  });
}

/** "2026-10-29" -> "29 Ekim Perşembe" */
function trDay(iso: string) {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}
