import { adminUpdateSchoolSchema, createSchoolSchema, schoolSettingsSchema, updateSchoolSchema } from '@okulpano/shared';
import { and, count, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessUser, audit, schoolGuard, UUID_RE } from '../context.ts';
import { announcements, auditLogs, memberships, schools, screens, students, teachers, users } from '../db/schema.ts';
import { hashPassword } from '../lib/crypto.ts';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors.ts';
import { geocode } from '../lib/weather.ts';

export function publicSchool(s: typeof schools.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    logoUrl: s.logoUrl,
    timezone: s.timezone,
    city: s.city,
    latitude: s.latitude,
    longitude: s.longitude,
    settings: schoolSettingsSchema.parse(s.settings ?? {}),
    plan: s.plan,
    maxScreens: s.maxScreens,
    isActive: s.isActive,
    trialEndsAt: s.trialEndsAt,
  };
}

export async function schoolRoutes(app: FastifyInstance) {
  const { db, bus, storage } = app.deps;
  const member = { preHandler: [app.authenticate, schoolGuard()] };

  app.get('/api/schools/:schoolId', member, async (req) => publicSchool(req.ctx.school));

  app.patch('/api/schools/:schoolId', { preHandler: [app.authenticate, schoolGuard('settings.manage')] }, async (req) => {
    const body = parse(updateSchoolSchema, req.body);
    const { settings, ...profile } = body;
    const merged = settings ? schoolSettingsSchema.parse({ ...req.ctx.school.settings, ...settings }) : undefined;
    const [updated] = await db
      .update(schools)
      .set({ ...profile, ...(merged ? { settings: merged } : {}) })
      .where(eq(schools.id, req.ctx.schoolId))
      .returning();
    await audit(req, 'update', 'Okul ayarları', req.ctx.schoolId, updated!.name);
    bus.contentChanged(req.ctx.schoolId);
    return publicSchool(updated!);
  });

  app.get('/api/schools/:schoolId/stats', member, async (req) => {
    const id = req.ctx.schoolId;
    const now = new Date();
    const [[a], [t], [s], screenRows] = await Promise.all([
      db
        .select({ n: count() })
        .from(announcements)
        .where(
          and(
            eq(announcements.schoolId, id),
            eq(announcements.isActive, true),
            or(isNull(announcements.startsAt), lte(announcements.startsAt, now)),
            or(isNull(announcements.endsAt), gte(announcements.endsAt, now)),
          ),
        ),
      db.select({ n: count() }).from(teachers).where(eq(teachers.schoolId, id)),
      db.select({ n: count() }).from(students).where(eq(students.schoolId, id)),
      db.select({ id: screens.id }).from(screens).where(eq(screens.schoolId, id)),
    ]);
    return {
      activeAnnouncements: a?.n ?? 0,
      teachers: t?.n ?? 0,
      students: s?.n ?? 0,
      screens: screenRows.length,
      screensOnline: screenRows.filter((r) => bus.isOnline(r.id)).length,
    };
  });

  app.get('/api/schools/:schoolId/audit', { preHandler: [app.authenticate, schoolGuard('users.manage')] }, async (req) => {
    const { before } = req.query as { before?: string };
    return db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        summary: auditLogs.summary,
        createdAt: auditLogs.createdAt,
        userName: users.fullName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(
        and(
          eq(auditLogs.schoolId, req.ctx.schoolId),
          before && !Number.isNaN(Date.parse(before)) ? sql`${auditLogs.createdAt} < ${new Date(before)}` : undefined,
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
  });

  /** Paneldeki canlı önizleme için 30 dakikalık, yalnızca okuma yapabilen pano anahtarı */
  app.post('/api/schools/:schoolId/preview-token', member, async (req) => ({
    token: app.jwt.sign({ typ: 'preview', sch: req.ctx.schoolId }, { expiresIn: '30m' }),
  }));

  app.post(
    '/api/schools/:schoolId/uploads',
    { preHandler: [app.authenticate, schoolGuard()], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const canUpload = req.ctx.permissions.some((p) => p === 'announcements.manage' || p === 'settings.manage');
      if (!canUpload) throw forbidden();
      const file = await req.file();
      if (!file) throw badRequest('Dosya bulunamadı.');
      const data = await file.toBuffer();
      const url = await storage.saveImage(req.ctx.schoolId, data);
      return reply.status(201).send({ url });
    },
  );

  app.get('/api/geocode', { preHandler: app.authenticate, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { q } = parse(z.object({ q: z.string().trim().min(2).max(80) }), req.query);
    try {
      return await geocode(q);
    } catch {
      throw badRequest('Konum servisine şu an ulaşılamıyor. Enlem ve boylamı elle girebilirsiniz.');
    }
  });

  /* ---------- Platform (SaaS) yönetimi: yalnızca platform yöneticisi ---------- */

  const platform = {
    preHandler: [
      app.authenticate,
      async (req: Parameters<typeof app.authenticate>[0]) => {
        if (!accessUser(req).sa) throw forbidden();
      },
    ],
  };

  app.get('/api/platform/schools', platform, async () => {
    const rows = await db
      .select({ school: schools, screens: sql<number>`(select count(*)::int from ${screens} where ${screens.schoolId} = ${schools.id})` })
      .from(schools)
      .orderBy(desc(schools.createdAt));
    return rows.map((r) => ({ ...publicSchool(r.school), screenCount: r.screens, createdAt: r.school.createdAt }));
  });

  app.post('/api/platform/schools', platform, async (req, reply) => {
    const body = parse(createSchoolSchema, req.body);
    const [taken] = await db.select({ id: schools.id }).from(schools).where(eq(schools.slug, body.slug));
    if (taken) throw conflict('Bu kısa ad kullanılıyor.');
    const email = body.ownerEmail.toLowerCase();

    const result = await db.transaction(async (tx) => {
      let [owner] = await tx.select().from(users).where(eq(users.email, email));
      if (!owner) {
        if (!body.ownerPassword) throw badRequest('Yeni okul sahibi için bir şifre belirleyin.');
        [owner] = await tx
          .insert(users)
          .values({ email, fullName: body.ownerName, passwordHash: await hashPassword(body.ownerPassword) })
          .returning();
      }
      const [school] = await tx
        .insert(schools)
        .values({
          name: body.name,
          slug: body.slug,
          plan: body.plan,
          maxScreens: body.maxScreens,
          trialEndsAt: body.plan === 'trial' ? new Date(Date.now() + 30 * 86400_000) : null,
        })
        .returning();
      await tx.insert(memberships).values({ userId: owner!.id, schoolId: school!.id, role: 'owner' });
      return school!;
    });
    return reply.status(201).send(publicSchool(result));
  });

  app.patch('/api/platform/schools/:id', platform, async (req) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const body = parse(adminUpdateSchoolSchema, req.body);
    const [updated] = await db.update(schools).set(body).where(eq(schools.id, id)).returning();
    if (!updated) throw notFound();
    bus.contentChanged(id);
    return publicSchool(updated);
  });
}
