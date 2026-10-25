import { EMERGENCY_INFO, emergencySchema } from '@okulpano/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { audit, schoolGuard } from '../context.ts';
import { schools, users } from '../db/schema.ts';
import { parse } from '../lib/errors.ts';

/**
 * Acil durum modu: başlatılınca okulun bütün panoları anında (SSE) tam ekran kırmızı uyarıya geçer,
 * bitirilene kadar da öyle kalır. Paneldeki herkes uyarının yayında olduğunu görür.
 */
export async function emergencyRoutes(app: FastifyInstance) {
  const { db, bus } = app.deps;
  const base = '/api/schools/:schoolId/emergency';
  const manage = { preHandler: [app.authenticate, schoolGuard('emergency.manage')] };

  app.get(base, { preHandler: [app.authenticate, schoolGuard()] }, async (req) => req.ctx.school.emergency ?? null);

  app.post(base, manage, async (req) => {
    const body = parse(emergencySchema, req.body);
    const [user] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, req.ctx.userId));
    const emergency = {
      type: body.type,
      message: body.message?.trim() || null,
      sound: body.sound,
      startedAt: new Date().toISOString(),
      startedBy: user?.fullName ?? null,
    };
    await db.update(schools).set({ emergency }).where(eq(schools.id, req.ctx.schoolId));
    await audit(req, 'publish', 'Acil durum', req.ctx.schoolId, EMERGENCY_INFO[body.type].label);
    bus.contentChanged(req.ctx.schoolId);
    return emergency;
  });

  app.delete(base, manage, async (req) => {
    const prev = req.ctx.school.emergency;
    await db.update(schools).set({ emergency: null }).where(eq(schools.id, req.ctx.schoolId));
    if (prev) await audit(req, 'unpublish', 'Acil durum', req.ctx.schoolId, EMERGENCY_INFO[prev.type].label);
    bus.contentChanged(req.ctx.schoolId);
    return null;
  });
}
