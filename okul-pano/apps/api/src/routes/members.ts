import { createMemberSchema, effectivePermissions, resetPasswordSchema, updateMemberSchema } from '@okulpano/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import { memberships, sessions, users } from '../db/schema.ts';
import { hashPassword, readablePassword } from '../lib/crypto.ts';
import { sendMail } from '../lib/mailer.ts';
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
    const created = !user;
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
    // E-posta sistemde zaten kayıtlıysa girilen geçici şifre kullanılmaz: panel bunu açıkça söyler
    return reply.status(201).send({ id: m!.id, existingUser: !created });
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

  /**
   * Yönetici bir kullanıcının şifresini sıfırlar (unutulan şifre): yeni şifre verilmezse rastgele
   * üretilir, kullanıcının bütün oturumları kapanır; istenirse e-postayla gönderilir.
   */
  app.post(`${base}/:memberId/password`, manage, async (req) => {
    const m = await loadMember(req);
    const body = parse(resetPasswordSchema, req.body ?? {});
    const password = body.password ?? readablePassword();
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, m.membership.userId));
    await db.delete(sessions).where(eq(sessions.userId, m.membership.userId));
    await audit(req, 'update', 'Kullanıcı şifresi', m.membership.id, `${m.fullName} şifresi sıfırlandı`);
    let emailed = false;
    if (body.sendEmail) {
      const url = `${app.deps.env.PUBLIC_URL.replace(/\/$/, '')}/admin/`;
      emailed = await sendMail(app.deps.env, {
        to: m.email,
        subject: `${req.ctx.school.name} · Okul Pano şifreniz`,
        text: `Merhaba ${m.fullName},\n\nOkul Pano yönetim paneli şifreniz yenilendi.\n\nAdres: ${url}\nE-posta: ${m.email}\nŞifre: ${password}\n\nGiriş yaptıktan sonra Hesabım sayfasından şifrenizi değiştirin.\n`,
      }).catch(() => false);
    }
    return { password, emailed, email: m.email, fullName: m.fullName };
  });

  app.delete(`${base}/:memberId`, manage, async (req, reply) => {
    const m = await loadMember(req);
    await db.delete(memberships).where(eq(memberships.id, m.membership.id));
    await audit(req, 'delete', 'Kullanıcı', m.membership.id, m.fullName);
    return reply.status(204).send();
  });
}
