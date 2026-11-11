import { and, desc, eq, notInArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { schoolGuard, UUID_RE } from '../context.ts';
import { announcementDrafts } from '../db/schema.ts';
import { badRequest, notFound, parse } from '../lib/errors.ts';

/*
 * Duyuru taslakları: adım adım duyuru eklerken pencere yarıda kapanınca form kaydedilir ve Duyurular › Taslaklar'da
 * kalır. Taslak yalnızca onu giren kişiye görünür. Kişi başına en çok 20 taslak tutulur (en eskisi düşer).
 */
const MAX_DRAFTS = 20;
const MAX_BYTES = 40_000;
const draftSchema = z.object({ step: z.number().int().min(0).max(3), data: z.record(z.string(), z.unknown()) });

export async function draftRoutes(app: FastifyInstance) {
  const { db } = app.deps;
  const base = '/api/schools/:schoolId/announcement-drafts';
  const guard = { preHandler: [app.authenticate, schoolGuard('announcements.manage')] };
  const own = (schoolId: string, userId: string) => and(eq(announcementDrafts.schoolId, schoolId), eq(announcementDrafts.userId, userId));
  const idOf = (params: unknown) => {
    const id = (params as { id?: string }).id;
    if (!id || !UUID_RE.test(id)) throw notFound();
    return id;
  };
  const body = (raw: unknown) => {
    const b = parse(draftSchema, raw);
    if (JSON.stringify(b.data).length > MAX_BYTES) throw badRequest('Taslak çok büyük.');
    return b;
  };

  app.get(base, guard, async (req) =>
    db
      .select({ id: announcementDrafts.id, step: announcementDrafts.step, data: announcementDrafts.data, updatedAt: announcementDrafts.updatedAt })
      .from(announcementDrafts)
      .where(own(req.ctx.schoolId, req.ctx.userId))
      .orderBy(desc(announcementDrafts.updatedAt)),
  );

  app.post(base, guard, async (req, reply) => {
    const b = body(req.body);
    const [row] = await db.insert(announcementDrafts).values({ schoolId: req.ctx.schoolId, userId: req.ctx.userId, step: b.step, data: b.data }).returning();
    // En yeni 20 taslak kalır
    const keep = await db
      .select({ id: announcementDrafts.id })
      .from(announcementDrafts)
      .where(own(req.ctx.schoolId, req.ctx.userId))
      .orderBy(desc(announcementDrafts.updatedAt))
      .limit(MAX_DRAFTS);
    await db.delete(announcementDrafts).where(and(own(req.ctx.schoolId, req.ctx.userId), notInArray(announcementDrafts.id, keep.map((k) => k.id))));
    return reply.status(201).send(row);
  });

  app.put(`${base}/:id`, guard, async (req) => {
    const b = body(req.body);
    const [row] = await db
      .update(announcementDrafts)
      .set({ step: b.step, data: b.data })
      .where(and(eq(announcementDrafts.id, idOf(req.params)), own(req.ctx.schoolId, req.ctx.userId)))
      .returning();
    if (!row) throw notFound();
    return row;
  });

  app.delete(`${base}/:id`, guard, async (req, reply) => {
    const [row] = await db
      .delete(announcementDrafts)
      .where(and(eq(announcementDrafts.id, idOf(req.params)), own(req.ctx.schoolId, req.ctx.userId)))
      .returning({ id: announcementDrafts.id });
    if (!row) throw notFound();
    return reply.status(204).send();
  });
}
