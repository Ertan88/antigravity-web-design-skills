import {
  bellShiftSchema,
  DAY_MODE_INFO,
  dayPlanSchema,
  dutySubstitutionSchema,
  flashSchema,
  formatClock,
  zonedParts,
  type Permission,
} from '@okulpano/shared';
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import { announcements, dayPlans, duties, dutySubstitutions, flashMessages, screens, teacherLeaves, teachers, users } from '../db/schema.ts';
import { dutyDay, dutyGaps, substituteCandidates, toDayPlan } from '../lib/dayinfo.ts';
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
 * Panoların uzaktan yönetimi (mobil uygulamanın yönetici ekranları ve panel):
 * anlık mesaj, günün modu ve zil kaydırma, nöbet boşlukları ve yerine görevlendirme, kontrol merkezi özeti.
 */
export async function controlRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const member = { preHandler: [app.authenticate, schoolGuard()] };
  const control = { preHandler: [app.authenticate, schoolGuard(), anyOf('board.control')] };
  const schedule = { preHandler: [app.authenticate, schoolGuard('schedule.manage')] };
  const dutyWrite = { preHandler: [app.authenticate, schoolGuard('duties.manage')] };
  const todayOf = (req: FastifyRequest) => zonedParts(new Date(), req.ctx.school.timezone);

  /* ---------- Panoya anlık mesaj ---------- */

  const flashBase = '/api/schools/:schoolId/flash';

  /** Yayındaki mesajlar ve son kullanılan metinler (hazır mesaj olarak sunulur) */
  app.get(flashBase, member, async (req) => {
    const now = new Date();
    const [active, recent] = await Promise.all([
      db
        .select({ ...flashColumns, createdByName: users.fullName })
        .from(flashMessages)
        .leftJoin(users, eq(users.id, flashMessages.createdBy))
        .where(and(eq(flashMessages.schoolId, req.ctx.schoolId), gt(flashMessages.endsAt, now)))
        .orderBy(desc(flashMessages.createdAt)),
      db
        .select({ text: flashMessages.text, createdAt: flashMessages.createdAt })
        .from(flashMessages)
        .where(and(eq(flashMessages.schoolId, req.ctx.schoolId), gte(flashMessages.createdAt, new Date(now.getTime() - 60 * 86400_000))))
        .orderBy(desc(flashMessages.createdAt))
        .limit(100),
    ]);
    // Okulun kendi geçmişinden: en sık kullanılan metinler önce (koda gömülü hazır metin yok)
    const freq = new Map<string, number>();
    for (const r of recent) freq.set(r.text, (freq.get(r.text) ?? 0) + 1);
    const presets = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text]) => text);
    return { active, presets };
  });

  app.post(flashBase, control, async (req, reply) => {
    const body = parse(flashSchema, req.body);
    const screenIds = body.screenIds?.length ? [...new Set(body.screenIds)] : null;
    if (screenIds) {
      const found = await db
        .select({ id: screens.id })
        .from(screens)
        .where(and(inArray(screens.id, screenIds), eq(screens.schoolId, req.ctx.schoolId)));
      if (found.length !== screenIds.length) throw badRequest('Seçilen panolardan biri bu okula ait değil.');
    }
    const [row] = await db
      .insert(flashMessages)
      .values({
        schoolId: req.ctx.schoolId,
        text: body.text,
        style: body.style,
        tone: body.tone,
        screenIds,
        endsAt: new Date(body.endsAt),
        createdBy: req.ctx.userId,
      })
      .returning();
    await audit(req, 'publish', 'Anlık mesaj', row!.id, body.text);
    bus.contentChanged(req.ctx.schoolId);
    return reply.status(201).send(row);
  });

  /** Mesajı süresi dolmadan kaldırır */
  app.delete(`${flashBase}/:id`, control, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const [row] = await db
      .update(flashMessages)
      .set({ endsAt: new Date() })
      .where(and(eq(flashMessages.id, id), eq(flashMessages.schoolId, req.ctx.schoolId)))
      .returning();
    if (!row) throw notFound();
    await audit(req, 'unpublish', 'Anlık mesaj', id, row.text);
    bus.contentChanged(req.ctx.schoolId);
    return reply.status(204).send();
  });

  /* ---------- Günün modu ve zil kaydırma ---------- */

  const planBase = '/api/schools/:schoolId/day-plan';

  async function loadPlan(schoolId: string, date: string) {
    const [row] = await db
      .select()
      .from(dayPlans)
      .where(and(eq(dayPlans.schoolId, schoolId), eq(dayPlans.date, date)));
    return row ?? null;
  }
  const planOut = (date: string, row: typeof dayPlans.$inferSelect | null) =>
    row ? toDayPlan(row) : { date, mode: 'normal' as const, lessonMin: null, shifts: [], note: null };

  app.get(planBase, member, async (req) => {
    const { date } = parse(dateQuery, req.query);
    const day = date ?? todayOf(req).isoDate;
    return planOut(day, await loadPlan(req.ctx.schoolId, day));
  });

  app.put(planBase, schedule, async (req) => {
    const body = parse(dayPlanSchema, req.body);
    const date = body.date ?? todayOf(req).isoDate;
    const values = {
      mode: body.mode,
      lessonMin: body.mode === 'short' ? (body.lessonMin ?? null) : null,
      note: body.note?.trim() || null,
      updatedBy: req.ctx.userId,
    };
    const [row] = await db
      .insert(dayPlans)
      .values({ schoolId: req.ctx.schoolId, date, ...values })
      .onConflictDoUpdate({ target: [dayPlans.schoolId, dayPlans.date], set: values })
      .returning();
    await audit(req, 'update', 'Günün modu', row!.id, `${date} · ${DAY_MODE_INFO[body.mode].label}`);
    bus.contentChanged(req.ctx.schoolId);
    return planOut(date, row!);
  });

  /** Zil kaydırma: şu andan (okulun saatiyle) sonraki zil saatleri kayar; art arda eklenebilir */
  app.post(`${planBase}/shift`, schedule, async (req) => {
    const { minutes } = parse(bellShiftSchema, req.body);
    const now = todayOf(req);
    const from = formatClock(now.secondsOfDay);
    const existing = await loadPlan(req.ctx.schoolId, now.isoDate);
    const shifts = [...(existing?.shifts ?? []), { from, minutes }];
    const [row] = await db
      .insert(dayPlans)
      .values({ schoolId: req.ctx.schoolId, date: now.isoDate, mode: 'normal', shifts, updatedBy: req.ctx.userId })
      .onConflictDoUpdate({ target: [dayPlans.schoolId, dayPlans.date], set: { shifts, updatedBy: req.ctx.userId } })
      .returning();
    await audit(req, 'update', 'Zil kaydırma', row!.id, `${from} sonrası ${minutes > 0 ? '+' : ''}${minutes} dk`);
    bus.contentChanged(req.ctx.schoolId);
    return planOut(now.isoDate, row!);
  });

  /** Günü normale döndürür (mod ve zil kaydırmaları silinir) */
  app.delete(planBase, schedule, async (req) => {
    const { date } = parse(dateQuery, req.query);
    const day = date ?? todayOf(req).isoDate;
    const [row] = await db
      .delete(dayPlans)
      .where(and(eq(dayPlans.schoolId, req.ctx.schoolId), eq(dayPlans.date, day)))
      .returning();
    if (row) await audit(req, 'update', 'Günün modu', row.id, `${day} · Normal gün`);
    bus.contentChanged(req.ctx.schoolId);
    return planOut(day, null);
  });

  /* ---------- Nöbet günü: kim nerede, boş yerler, yerine görevlendirme ---------- */

  app.get('/api/schools/:schoolId/duty-day', member, async (req) => {
    const { date } = parse(dateQuery, req.query);
    const day = await dutyDay(db, req.ctx.schoolId, date ?? todayOf(req).isoDate);
    const canAssign = req.ctx.permissions.includes('duties.manage');
    // Onay bekleyen izin talepleri yalnızca izin ya da nöbet yetkisi olanlara görünür
    const seesRequests = canAssign || req.ctx.permissions.includes('leaves.manage');
    return {
      ...day,
      entries: seesRequests ? day.entries : day.entries.map((e) => ({ ...e, leavePending: false })),
      gaps: dutyGaps(day).map((g) => g.dutyId),
      // Öneriler yalnızca görevlendirme yapabilenlere (ve boş yer varken) hesaplanır
      candidates: canAssign && dutyGaps(day).length ? await substituteCandidates(db, req.ctx.schoolId, day) : [],
    };
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
    const [screenRows, [pendingAnn], [pendingLeaves], [onAir], endingToday, day, plan, flash] = await Promise.all([
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
      loadPlan(schoolId, today.isoDate),
      db
        .select(flashColumns)
        .from(flashMessages)
        .where(and(eq(flashMessages.schoolId, schoolId), gt(flashMessages.endsAt, now), lte(flashMessages.startsAt, now)))
        .orderBy(desc(flashMessages.createdAt)),
    ]);
    const screensOut = screenRows.map((s) => ({ ...s, online: bus.isOnline(s.id) }));
    return {
      today: today.isoDate,
      emergency: req.ctx.school.emergency ?? null,
      dayPlan: planOut(today.isoDate, plan),
      screens: { total: screensOut.length, online: screensOut.filter((s) => s.online).length, offline: screensOut.filter((s) => !s.online) },
      pending: {
        announcements: permissions.includes('announcements.approve') ? (pendingAnn?.n ?? 0) : 0,
        leaves: permissions.includes('leaves.manage') ? (pendingLeaves?.n ?? 0) : 0,
      },
      onAir: onAir?.n ?? 0,
      endingToday,
      dutyGaps: dutyGaps(day).map((g) => ({ dutyId: g.dutyId, area: g.area, teacherName: g.teacherName })),
      holiday: day.holiday,
      flash,
    };
  });
}

const flashColumns = {
  id: flashMessages.id,
  text: flashMessages.text,
  style: flashMessages.style,
  tone: flashMessages.tone,
  screenIds: flashMessages.screenIds,
  startsAt: flashMessages.startsAt,
  endsAt: flashMessages.endsAt,
  createdAt: flashMessages.createdAt,
};

/** "2026-10-29" -> "29 Ekim Perşembe" */
function trDay(iso: string) {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}
