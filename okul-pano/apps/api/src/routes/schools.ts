import { adminUpdateSchoolSchema, createSchoolSchema, labelsSchema, schoolSettingsSchema, updateSchoolSchema } from '@okulpano/shared';
import { and, count, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessUser, audit, schoolGuard, UUID_RE } from '../context.ts';
import { announcements, auditLogs, memberships, schools, screens, students, teachers, users } from '../db/schema.ts';
import { hashPassword } from '../lib/crypto.ts';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors.ts';
import { geocode } from '../lib/weather.ts';
import { SAMPLE_TABLES, seedSchoolContent, type SampleData } from '../seed-data.ts';
import { addDefaultTeacherOptions } from './teachers.ts';

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
    onboarding: s.onboarding,
    supportAccessUntil: s.supportAccessUntil,
    hasSampleData: Boolean(s.sampleData && Object.values(s.sampleData).some((ids) => ids.length)),
  };
}

export async function schoolRoutes(app: FastifyInstance) {
  const { db, bus, storage } = app.deps;
  const member = { preHandler: [app.authenticate, schoolGuard()] };

  app.get('/api/schools/:schoolId', member, async (req) => publicSchool(req.ctx.school));

  app.patch('/api/schools/:schoolId', { preHandler: [app.authenticate, schoolGuard('settings.manage')] }, async (req) => {
    const body = parse(updateSchoolSchema, req.body);
    const { settings, ...profile } = body;
    // Yalnızca gönderilen ayarlar değişir: şemadaki varsayılanlar gönderilmeyen ayarları (okul türü, kayan yazı
    // kaynakları…) sıfırlamasın
    const sent = Object.keys(((req.body ?? {}) as { settings?: object }).settings ?? {});
    const changes = settings ? Object.fromEntries(Object.entries(settings).filter(([k]) => sent.includes(k))) : undefined;
    const merged = changes ? schoolSettingsSchema.parse({ ...req.ctx.school.settings, ...changes }) : undefined;
    const [updated] = await db
      .update(schools)
      .set({ ...profile, ...(merged ? { settings: merged } : {}) })
      .where(eq(schools.id, req.ctx.schoolId))
      .returning();
    await audit(req, 'update', 'Okul ayarları', req.ctx.schoolId, updated!.name);
    bus.contentChanged(req.ctx.schoolId);
    return publicSchool(updated!);
  });

  /**
   * KVKK: platform desteğinin okul verilerine erişimi. Yalnızca okulun kendi yöneticisi verir ya da kapatır;
   * süre dolunca erişim kendiliğinden kapanır. Destek erişimiyle girilen işlemler etkinlik geçmişine düşer.
   */
  app.post('/api/schools/:schoolId/support-access', { preHandler: [app.authenticate, schoolGuard('settings.manage')] }, async (req) => {
    if (req.ctx.isSupport) throw forbidden('Destek erişimini yalnızca okul yöneticisi verebilir.');
    const { hours } = parse(z.object({ hours: z.union([z.literal(0), z.literal(24), z.literal(168)]) }), req.body);
    const until = hours ? new Date(Date.now() + hours * 3600_000) : null;
    const [updated] = await db.update(schools).set({ supportAccessUntil: until }).where(eq(schools.id, req.ctx.schoolId)).returning();
    await audit(req, 'update', 'Destek erişimi', req.ctx.schoolId, hours ? `Platform desteğine ${hours === 24 ? '24 saat' : '7 gün'} erişim verildi` : 'Platform desteğinin erişimi kapatıldı');
    return publicSchool(updated!);
  });

  /** Kart ve sekme başlıkları: okul ayarlarından ayrı yetkiyle (Başlıkları düzenleme) */
  app.put('/api/schools/:schoolId/labels', { preHandler: [app.authenticate, schoolGuard('labels.manage')] }, async (req) => {
    const { labels } = parse(labelsSchema, req.body);
    // Boş bırakılan başlık kaydedilmez: varsayılan kullanılır
    const clean = Object.fromEntries(Object.entries(labels).filter(([, v]) => v && v.trim()));
    const settings = schoolSettingsSchema.parse({ ...req.ctx.school.settings, labels: clean });
    const [updated] = await db.update(schools).set({ settings }).where(eq(schools.id, req.ctx.schoolId)).returning();
    await audit(req, 'update', 'Başlıklar', req.ctx.schoolId, Object.keys(clean).length ? `${Object.keys(clean).length} başlık özelleştirildi` : 'Başlıklar varsayılana döndü');
    bus.contentChanged(req.ctx.schoolId);
    return publicSchool(updated!);
  });

  /** İlk giriş sorusu: örnek verilerle mi boş mu başlanacak */
  app.post('/api/schools/:schoolId/onboarding', { preHandler: [app.authenticate, schoolGuard('settings.manage')] }, async (req) => {
    const { sample } = parse(z.object({ sample: z.boolean() }), req.body);
    const id = req.ctx.schoolId;
    // Çift tıklamada iki kez örnek veri eklenmesin: soru tek seferde "cevaplandı" yapılır
    const [claimed] = await db
      .update(schools)
      .set({ onboarding: sample ? 'sample' : 'empty' })
      .where(and(eq(schools.id, id), eq(schools.onboarding, 'pending')))
      .returning();
    if (!claimed) throw conflict('Bu soru zaten cevaplandı.');
    if (!sample) return publicSchool(claimed);
    try {
      const { ids } = await seedSchoolContent(db, id, { storage, timezone: claimed.timezone });
      const [updated] = await db.update(schools).set({ sampleData: ids }).where(eq(schools.id, id)).returning();
      await audit(req, 'create', 'Örnek veriler', id, claimed.name);
      bus.contentChanged(id);
      return publicSchool(updated!);
    } catch (err) {
      await db.update(schools).set({ onboarding: 'pending' }).where(eq(schools.id, id));
      throw err;
    }
  });

  /** Örnek verileri temizler: yalnızca örnek olarak eklenen kayıtlar silinir, okulun kendi girdiği veriler kalır */
  app.post('/api/schools/:schoolId/sample-data/clear', { preHandler: [app.authenticate, schoolGuard('settings.manage')] }, async (req) => {
    const id = req.ctx.schoolId;
    const sampleData = (req.ctx.school.sampleData ?? {}) as SampleData;
    const [updated] = await db.transaction(async (tx) => {
      for (const [key, table] of Object.entries(SAMPLE_TABLES) as [keyof typeof SAMPLE_TABLES, (typeof SAMPLE_TABLES)[keyof typeof SAMPLE_TABLES]][]) {
        const rowIds = sampleData[key];
        if (rowIds?.length) await tx.delete(table).where(and(eq(table.schoolId, id), inArray(table.id, rowIds)));
      }
      return tx.update(schools).set({ sampleData: null }).where(eq(schools.id, id)).returning();
    });
    await audit(req, 'delete', 'Örnek veriler', id, updated!.name);
    bus.contentChanged(id);
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

  app.get('/api/platform/schools', platform, async (req) => {
    const rows = await db
      .select({ school: schools, screens: count(screens.id) })
      .from(schools)
      .leftJoin(screens, eq(screens.schoolId, schools.id))
      .groupBy(schools.id)
      .orderBy(desc(schools.createdAt));
    // Panelde açılabilen okullar: üyesi olunan ya da destek erişimi süren (KVKK)
    const own = new Set((await db.select({ id: memberships.schoolId }).from(memberships).where(eq(memberships.userId, accessUser(req).sub))).map((m) => m.id));
    const now = Date.now();
    return rows.map((r) => ({
      ...publicSchool(r.school),
      screenCount: r.screens,
      contactPhone: r.school.contactPhone,
      createdAt: r.school.createdAt,
      member: own.has(r.school.id),
      canOpen: own.has(r.school.id) || (r.school.supportAccessUntil?.getTime() ?? 0) > now,
    }));
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
          onboarding: 'pending',
        })
        .returning();
      await tx.insert(memberships).values({ userId: owner!.id, schoolId: school!.id, role: 'owner' });
      await addDefaultTeacherOptions(tx, school!.id);
      return school!;
    });
    return reply.status(201).send(publicSchool(result));
  });

  app.patch('/api/platform/schools/:id', platform, async (req) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const { extendTrialDays, ...body } = parse(adminUpdateSchoolSchema, req.body);
    const [current] = await db.select().from(schools).where(eq(schools.id, id));
    if (!current) throw notFound();
    const plan = body.plan ?? current.plan;
    const trial: Partial<typeof schools.$inferInsert> =
      plan !== 'trial'
        ? // Ücretli pakette deneme bitişi yok
          { trialEndsAt: null, trialNotice: null }
        : extendTrialDays
          ? {
              trialEndsAt: new Date(Math.max(Date.now(), current.trialEndsAt?.getTime() ?? 0) + extendTrialDays * 86400_000),
              trialNotice: null,
            }
          : current.plan !== 'trial'
            ? { trialEndsAt: new Date(Date.now() + 30 * 86400_000), trialNotice: null }
            : {};
    const [updated] = await db.update(schools).set({ ...body, ...trial }).where(eq(schools.id, id)).returning();
    if (!updated) throw notFound();
    bus.contentChanged(id);
    return publicSchool(updated);
  });
}
