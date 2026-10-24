import { createMemberSchema, effectivePermissions, updateMemberSchema } from '@okulpano/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import { memberships, users } from '../db/schema.ts';
import { hashPassword } from '../lib/crypto.ts';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors.ts';

export async function memberRoutes(app: FastifyInstance) {
  const { db } = app.deps;
  const base = '/api/schools/:schoolId/members';
  const manage = { preHandler: [app.authenticate, schoolGuard('users.manage')] };

  async function loadMember(req: FastifyRequest) {
    const { memberId } = req.params as { memberId: string };
    if (!UUID_RE.test(memberId)) throw notFound();
    const [m] = await db
      .select({ membership: memberships, email: users.email, fullName: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.id, memberId), eq(memberships.schoolId, req.ctx.schoolId)));
    if (!m) throw notFound('Kullanıcı bulunamadı.');
    if (m.membership.role === 'owner') throw forbidden('Okul sahibinin yetkileri buradan değiştirilemez.');
    if (m.membership.userId === req.ctx.userId) throw forbidden('Kendi yetkilerinizi değiştiremezsiniz.');
    return m;
  }

  app.get(base, manage, async (req) => {
    const rows = await db
      .select({
        id: memberships.id,
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        role: memberships.role,
        permissions: memberships.permissions,
        lastLoginAt: users.lastLoginAt,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.schoolId, req.ctx.schoolId))
      .orderBy(asc(users.fullName));
    return rows.map((r) => ({ ...r, effectivePermissions: effectivePermissions(r.role, r.permissions) }));
  });

  app.post(base, manage, async (req, reply) => {
    const body = parse(createMemberSchema, req.body);
    const email = body.email.toLowerCase();
    let [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      if (!body.password) throw badRequest('Yeni kullanıcı için geçici bir şifre belirleyin.');
      [user] = await db
        .insert(users)
        .values({ email, fullName: body.fullName, passwordHash: await hashPassword(body.password) })
        .returning();
    }
    const [existing] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, user!.id), eq(memberships.schoolId, req.ctx.schoolId)));
    if (existing) throw conflict('Bu kullanıcı zaten okulunuzda kayıtlı.');

    const [m] = await db
      .insert(memberships)
      .values({
        userId: user!.id,
        schoolId: req.ctx.schoolId,
        role: body.role,
        permissions: body.role === 'editor' ? effectivePermissions('editor', body.permissions) : [],
      })
      .returning();
    await audit(req, 'create', 'Kullanıcı', m!.id, `${body.fullName} (${email})`);
    return reply.status(201).send({ id: m!.id });
  });

  app.patch(`${base}/:memberId`, manage, async (req) => {
    const m = await loadMember(req);
    const body = parse(updateMemberSchema, req.body);
    const role = body.role ?? m.membership.role;
    const permissions = role === 'editor' ? effectivePermissions('editor', body.permissions ?? m.membership.permissions) : [];
    await db.update(memberships).set({ role, permissions }).where(eq(memberships.id, m.membership.id));
    await audit(req, 'update', 'Kullanıcı yetkisi', m.membership.id, m.fullName);
    return { ok: true };
  });

  app.delete(`${base}/:memberId`, manage, async (req, reply) => {
    const m = await loadMember(req);
    await db.delete(memberships).where(eq(memberships.id, m.membership.id));
    await audit(req, 'delete', 'Kullanıcı', m.membership.id, m.fullName);
    return reply.status(204).send();
  });
}
