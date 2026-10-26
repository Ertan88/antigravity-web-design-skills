import { changePasswordSchema, effectivePermissions, loginSchema } from '@okulpano/shared';
import { and, asc, eq, gt, lt } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { accessUser } from '../context.ts';
import { memberships, schools, sessions, users } from '../db/schema.ts';
import { burnPasswordCheck, hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto.ts';
import { badRequest, parse, unauthorized } from '../lib/errors.ts';

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const COOKIE = 'op_refresh';

export async function authRoutes(app: FastifyInstance) {
  const { db, env } = app.deps;
  const secureCookie = env.NODE_ENV === 'production';

  function setRefreshCookie(reply: FastifyReply, token: string) {
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: REFRESH_TTL_MS / 1000,
    });
  }

  async function issueSession(req: FastifyRequest, userId: string) {
    const refreshToken = randomToken('rt');
    await db.insert(sessions).values({
      userId,
      tokenHash: sha256(refreshToken),
      userAgent: req.headers['user-agent']?.slice(0, 200) ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return refreshToken;
  }

  function accessToken(user: { id: string; isSuperAdmin: boolean }) {
    return app.jwt.sign({ typ: 'access', sub: user.id, sa: user.isSuperAdmin }, { expiresIn: ACCESS_TTL });
  }

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const [user] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase()));
    if (!user) {
      await burnPasswordCheck(body.password);
      throw unauthorized('E-posta ya da şifre hatalı.');
    }
    if (!(await verifyPassword(body.password, user.passwordHash))) throw unauthorized('E-posta ya da şifre hatalı.');

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    const refreshToken = await issueSession(req, user.id);
    setRefreshCookie(reply, refreshToken);
    return {
      accessToken: accessToken(user),
      ...(body.client === 'mobile' ? { refreshToken } : {}),
    };
  });

  /** Yenileme anahtarı her kullanımda döndürülür (rotation); çalınan eski anahtar işe yaramaz. */
  app.post('/api/auth/refresh', async (req, reply) => {
    const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
    const token = typeof fromBody === 'string' ? fromBody : req.cookies[COOKIE];
    if (!token) throw unauthorized();
    const [session] = await db
      .delete(sessions)
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
      .returning();
    if (!session) {
      reply.clearCookie(COOKIE, { path: '/api/auth' });
      throw unauthorized('Oturumun süresi doldu, lütfen yeniden giriş yapın.');
    }
    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    if (!user) throw unauthorized();
    const refreshToken = await issueSession(req, user.id);
    setRefreshCookie(reply, refreshToken);
    return {
      accessToken: accessToken(user),
      ...(typeof fromBody === 'string' ? { refreshToken } : {}),
    };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
    const token = typeof fromBody === 'string' ? fromBody : req.cookies[COOKIE];
    if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
    reply.clearCookie(COOKIE, { path: '/api/auth' });
    return reply.status(204).send();
  });

  app.get('/api/me', { preHandler: app.authenticate }, async (req) => {
    const { sub } = accessUser(req);
    const [user] = await db
      .select({ id: users.id, email: users.email, fullName: users.fullName, isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, sub));
    if (!user) throw unauthorized();

    const rows = user.isSuperAdmin
      ? (await db.select().from(schools).orderBy(asc(schools.name))).map((school) => ({
          school,
          role: 'owner' as const,
          permissions: [] as string[],
          teacherId: null as string | null,
        }))
      : await db
          .select({ school: schools, role: memberships.role, permissions: memberships.permissions, teacherId: memberships.teacherId })
          .from(memberships)
          .innerJoin(schools, eq(schools.id, memberships.schoolId))
          .where(eq(memberships.userId, sub))
          .orderBy(asc(schools.name));

    return {
      user,
      schools: rows.map((r) => ({
        id: r.school.id,
        name: r.school.name,
        slug: r.school.slug,
        logoUrl: r.school.logoUrl,
        isActive: r.school.isActive,
        role: r.role,
        permissions: effectivePermissions(r.role, r.permissions),
        teacherId: r.teacherId,
      })),
    };
  });

  app.post('/api/me/password', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub } = accessUser(req);
    const body = parse(changePasswordSchema, req.body);
    const [user] = await db.select().from(users).where(eq(users.id, sub));
    if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw badRequest('Mevcut şifre hatalı.');
    }
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.newPassword) })
      .where(eq(users.id, sub));
    // Diğer cihazlardaki oturumları kapat
    await db.delete(sessions).where(eq(sessions.userId, sub));
    const refreshToken = await issueSession(req, sub);
    setRefreshCookie(reply, refreshToken);
    return { ok: true };
  });
}
