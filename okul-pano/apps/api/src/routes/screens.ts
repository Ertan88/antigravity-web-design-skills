import { pairScreenSchema, resolveScreenDisplay, screenSchema } from '@okulpano/shared';
import { and, asc, count, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import { displayPairings, screens } from '../db/schema.ts';
import { randomToken, sha256 } from '../lib/crypto.ts';
import { badRequest, forbidden, notFound, parse } from '../lib/errors.ts';

export const DEVICE_TOKEN_PREFIX = 'opd';

/** Ekran (cihaz) yönetimi: eşleştirme, uzaktan yenileme, anahtar yenileme. */
export async function screenRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const base = '/api/schools/:schoolId/screens';
  const manage = { preHandler: [app.authenticate, schoolGuard('screens.manage')] };

  const toPublic = (s: typeof screens.$inferSelect) => ({
    id: s.id,
    name: s.name,
    location: s.location,
    lastSeenAt: s.lastSeenAt,
    online: bus.isOnline(s.id),
    hasKey: Boolean(s.tokenHash),
    layout: s.layout ?? null,
    display: resolveScreenDisplay(s.display),
    createdAt: s.createdAt,
  });

  async function assertCapacity(req: FastifyRequest) {
    const [row] = await db.select({ n: count() }).from(screens).where(eq(screens.schoolId, req.ctx.schoolId));
    if ((row?.n ?? 0) >= req.ctx.school.maxScreens) {
      throw forbidden(`Paketiniz en fazla ${req.ctx.school.maxScreens} ekrana izin veriyor. Paket yükseltmek için bizimle iletişime geçin.`);
    }
  }

  async function loadScreen(req: FastifyRequest) {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const [s] = await db
      .select()
      .from(screens)
      .where(and(eq(screens.id, id), eq(screens.schoolId, req.ctx.schoolId)));
    if (!s) throw notFound('Ekran bulunamadı.');
    return s;
  }

  app.get(base, { preHandler: [app.authenticate, schoolGuard()] }, async (req) => {
    const rows = await db.select().from(screens).where(eq(screens.schoolId, req.ctx.schoolId)).orderBy(asc(screens.name));
    return rows.map(toPublic);
  });

  /** Ekranda görünen 6 haneli kodla eşleştirme */
  app.post(`${base}/pair`, manage, async (req, reply) => {
    const body = parse(pairScreenSchema, req.body);
    await assertCapacity(req);
    const [pairing] = await db
      .select()
      .from(displayPairings)
      .where(and(eq(displayPairings.code, body.code), isNull(displayPairings.screenId), gt(displayPairings.expiresAt, new Date())));
    if (!pairing) throw badRequest('Kod bulunamadı ya da süresi doldu. Ekrandaki güncel kodu girin.');

    const [screen] = await db
      .insert(screens)
      .values({ schoolId: req.ctx.schoolId, name: body.name, location: body.location ?? null })
      .returning();
    await db.update(displayPairings).set({ screenId: screen!.id }).where(eq(displayPairings.id, pairing.id));
    await audit(req, 'create', 'Ekran', screen!.id, screen!.name);
    return reply.status(201).send(toPublic(screen!));
  });

  /** Kod girmeden kurulum: tek kullanımlık kurulum bağlantısı üretir (kiosk betikleri için). */
  app.post(base, manage, async (req, reply) => {
    const body = parse(screenSchema, req.body);
    await assertCapacity(req);
    const token = randomToken(DEVICE_TOKEN_PREFIX);
    const [screen] = await db
      .insert(screens)
      .values({ schoolId: req.ctx.schoolId, name: body.name, location: body.location ?? null, tokenHash: sha256(token) })
      .returning();
    await audit(req, 'create', 'Ekran', screen!.id, screen!.name);
    return reply.status(201).send({ screen: toPublic(screen!), token });
  });

  app.put(`${base}/:id`, manage, async (req) => {
    const s = await loadScreen(req);
    const body = parse(screenSchema, req.body);
    const [updated] = await db
      .update(screens)
      .set({
        name: body.name,
        location: body.location ?? null,
        ...(body.layout !== undefined ? { layout: body.layout } : {}),
        ...(body.display !== undefined ? { display: body.display } : {}),
      })
      .where(eq(screens.id, s.id))
      .returning();
    await audit(req, 'update', 'Ekran', s.id, body.name);
    // Düzen ya da ekran biçimi değişince ekran yeniden veri çeker
    if (body.layout !== undefined || body.display !== undefined) bus.contentChanged(req.ctx.schoolId);
    return toPublic(updated!);
  });

  /** Anahtar sızdıysa: eski anahtar anında geçersiz olur, cihaz yeniden kurulmalıdır. */
  app.post(`${base}/:id/rotate-key`, manage, async (req) => {
    const s = await loadScreen(req);
    const token = randomToken(DEVICE_TOKEN_PREFIX);
    await db.update(screens).set({ tokenHash: sha256(token) }).where(eq(screens.id, s.id));
    bus.publish(req.ctx.schoolId, { type: 'command', command: 'reload', screenId: s.id });
    await audit(req, 'update', 'Ekran anahtarı', s.id, s.name);
    return { token };
  });

  app.post(`${base}/:id/command`, manage, async (req) => {
    const s = await loadScreen(req);
    const { command } = parse(z.object({ command: z.enum(['reload', 'identify']) }), req.body);
    bus.publish(req.ctx.schoolId, { type: 'command', command, screenId: s.id });
    return { ok: true, delivered: bus.isOnline(s.id) };
  });

  app.delete(`${base}/:id`, manage, async (req, reply) => {
    const s = await loadScreen(req);
    await db.delete(screens).where(eq(screens.id, s.id));
    bus.publish(req.ctx.schoolId, { type: 'command', command: 'reload', screenId: s.id });
    await audit(req, 'delete', 'Ekran', s.id, s.name);
    return reply.status(204).send();
  });
}
