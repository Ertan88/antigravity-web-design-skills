import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { accessUser, type MfaPayload } from '../context.ts';
import { mfaRecoveryCodes, sessions, trustedDevices, users } from '../db/schema.ts';
import { decryptSecret, encryptSecret, randomToken, sha256, verifyPassword } from '../lib/crypto.ts';
import { badRequest, forbidden, HttpError, notFound, parse, unauthorized } from '../lib/errors.ts';
import { clearFailures, lockedFor, noteFailure } from '../lib/loginLock.ts';
import { newRecoveryCodes, newTotpSecret, normalizeRecovery, otpauthUrl, verifyTotp } from '../lib/totp.ts';

/*
 * İki adımlı doğrulama (1C) ve Oturumlarım (9B).
 * - Doğrulayıcı uygulama (TOTP). Platform yöneticisinde zorunlu (PLATFORM_MFA), diğer hesaplarda isteğe bağlı.
 * - Şifre doğruysa ve kod gerekiyorsa giriş 5 dakikalık bir "kod bekleniyor" anahtarı döndürür; oturum açılmaz.
 * - "Bu cihazı 30 gün hatırla": web'de httpOnly çerez, mobilde gövdede dönen anahtar; sunucuda yalnızca özeti durur.
 * - 10 yedek kod; her biri bir kez çalışır. Kodlar kaybolursa platform yöneticisi okul hesabında kapatabilir.
 * - Kod denemeleri hesap başına kilitlenir (5 hatada 5 dakika), giriş kilidiyle aynı yapı.
 */
export const TRUST_COOKIE = 'op_trust';
const TRUST_TTL_MS = 30 * 24 * 3600 * 1000;
const MFA_TTL = '5m';

export interface SessionTools {
  issueSession: (req: FastifyRequest, userId: string, viaUserId?: string | null) => Promise<{ token: string; id: string }>;
  accessToken: (user: { id: string; isSuperAdmin: boolean; totpEnabledAt: Date | null }, sid: string) => string;
  setRefreshCookie: (reply: FastifyReply, token: string) => void;
}

/** Tarayıcı bilgisinden kısa cihaz adı (konum ve IP tutulmaz) */
export function deviceName(ua: string | null): string {
  if (!ua) return 'Bilinmeyen cihaz';
  if (/okhttp|OkulYayin|Expo/i.test(ua)) return 'Okul Yayın · Android';
  if (/CFNetwork|Darwin/i.test(ua)) return 'Okul Yayın · iPhone';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Tarayıcı';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

export async function mfaRoutes(app: FastifyInstance, tools: SessionTools) {
  const { db, env } = app.deps;
  const secureCookie = env.NODE_ENV === 'production';
  const mfaRequired = (u: { isSuperAdmin: boolean }) => u.isSuperAdmin && env.PLATFORM_MFA === 'required';
  const secretOf = (stored: string | null) => (stored ? decryptSecret(stored, env.JWT_SECRET) : null);

  /** Girişte kod gerekiyor mu: kapalıysa hayır; bu cihaz hatırlanıyorsa hayır */
  async function needsCode(req: FastifyRequest, user: { id: string; totpSecret: string | null }, bodyTrust?: string) {
    if (!user.totpSecret) return false;
    const token = bodyTrust ?? req.cookies[TRUST_COOKIE];
    if (!token) return true;
    const [row] = await db
      .select({ id: trustedDevices.id })
      .from(trustedDevices)
      .where(and(eq(trustedDevices.tokenHash, sha256(token)), eq(trustedDevices.userId, user.id), gt(trustedDevices.expiresAt, new Date())));
    return !row;
  }

  function mfaChallenge(userId: string) {
    return { mfaRequired: true as const, mfaToken: app.jwt.sign({ typ: 'mfa', sub: userId } satisfies MfaPayload, { expiresIn: MFA_TTL }) };
  }

  /** Doğrulayıcı kodu ya da yedek kod. Başarılıysa true; kilit ve tekrar kullanım denetimi içerir. */
  async function checkSecondFactor(user: typeof users.$inferSelect, input: { code?: string; recoveryCode?: string }) {
    const key = `mfa:${user.id}`;
    const wait = await lockedFor(db, key);
    if (wait > 0) throw new HttpError(429, `Çok sayıda hatalı kod denendi. ${Math.ceil(wait / 60)} dakika sonra yeniden deneyin.`, 'too_many');
    let ok = false;
    if (input.code) {
      const secret = secretOf(user.totpSecret);
      const step = secret ? verifyTotp(secret, input.code, { afterStep: user.totpLastStep }) : null;
      if (step != null) {
        ok = true;
        await db.update(users).set({ totpLastStep: step }).where(eq(users.id, user.id));
      }
    } else if (input.recoveryCode) {
      const hash = sha256(`rc:${normalizeRecovery(input.recoveryCode)}`);
      const [used] = await db
        .update(mfaRecoveryCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(mfaRecoveryCodes.userId, user.id), eq(mfaRecoveryCodes.codeHash, hash), isNull(mfaRecoveryCodes.usedAt)))
        .returning({ id: mfaRecoveryCodes.id });
      ok = Boolean(used);
    }
    if (!ok) {
      await noteFailure(db, key);
      return false;
    }
    await clearFailures(db, key);
    return true;
  }

  async function rememberDevice(req: FastifyRequest, reply: FastifyReply, userId: string, mobile: boolean) {
    const token = randomToken('td');
    await db.insert(trustedDevices).values({
      userId,
      tokenHash: sha256(token),
      userAgent: req.headers['user-agent']?.slice(0, 200) ?? null,
      expiresAt: new Date(Date.now() + TRUST_TTL_MS),
    });
    if (mobile) return token;
    reply.setCookie(TRUST_COOKIE, token, { httpOnly: true, secure: secureCookie, sameSite: 'lax', path: '/api/auth', maxAge: TRUST_TTL_MS / 1000 });
    return undefined;
  }

  async function newRecovery(userId: string) {
    const codes = newRecoveryCodes();
    await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await db.insert(mfaRecoveryCodes).values(codes.map((c) => ({ userId, codeHash: sha256(`rc:${normalizeRecovery(c)}`) })));
    return codes;
  }

  /** İki adımlı doğrulamayı ve ona bağlı her şeyi kaldırır */
  async function clearMfa(userId: string) {
    await db.update(users).set({ totpSecret: null, totpPending: null, totpEnabledAt: null, totpLastStep: null }).where(eq(users.id, userId));
    await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
  }

  async function me(req: FastifyRequest) {
    const { sub } = accessUser(req);
    const [user] = await db.select().from(users).where(eq(users.id, sub));
    if (!user) throw unauthorized();
    return user;
  }
  async function requirePassword(user: typeof users.$inferSelect, password: string | undefined) {
    if (!password || !(await verifyPassword(password, user.passwordHash))) throw badRequest('Şifre hatalı.');
  }

  // ——— Giriş: kod adımı ———
  const mfaLoginSchema = z
    .object({
      mfaToken: z.string().min(10).max(2000),
      code: z.string().trim().max(12).optional(),
      recoveryCode: z.string().trim().max(20).optional(),
      remember: z.boolean().default(false),
      client: z.enum(['web', 'mobile']).default('web'),
    })
    .refine((b) => Boolean(b.code) !== Boolean(b.recoveryCode), 'Kodu girin.');
  app.post('/api/auth/mfa', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(mfaLoginSchema, req.body);
    let payload: MfaPayload;
    try {
      payload = app.jwt.verify<MfaPayload>(body.mfaToken);
    } catch {
      throw unauthorized('Kodun süresi doldu; yeniden giriş yapın.');
    }
    if (payload.typ !== 'mfa') throw unauthorized();
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub));
    if (!user?.totpSecret) throw unauthorized();
    if (!(await checkSecondFactor(user, body))) throw badRequest(body.code ? 'Kod hatalı ya da süresi geçti.' : 'Yedek kod hatalı ya da daha önce kullanılmış.');
    const mobile = body.client === 'mobile';
    const trustToken = body.remember ? await rememberDevice(req, reply, user.id, mobile) : undefined;
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const s = await tools.issueSession(req, user.id);
    tools.setRefreshCookie(reply, s.token);
    return { accessToken: tools.accessToken(user, s.id), ...(mobile ? { refreshToken: s.token } : {}), ...(trustToken ? { trustToken } : {}) };
  });

  // ——— Hesabım › Güvenlik ———
  app.get('/api/me/security', { preHandler: app.authenticate }, async (req) => {
    const user = await me(req);
    const { sid } = accessUser(req);
    const [codes, list] = await Promise.all([
      db.select({ id: mfaRecoveryCodes.id }).from(mfaRecoveryCodes).where(and(eq(mfaRecoveryCodes.userId, user.id), isNull(mfaRecoveryCodes.usedAt))),
      db
        .select({ id: sessions.id, userAgent: sessions.userAgent, createdAt: sessions.createdAt })
        .from(sessions)
        .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
        .orderBy(desc(sessions.createdAt)),
    ]);
    return {
      mfa: { enabled: Boolean(user.totpSecret), required: mfaRequired(user), enabledAt: user.totpEnabledAt?.toISOString() ?? null, recoveryLeft: codes.length },
      // Oturum yenilendikçe yeni kayıt açılır: kaydın açılış zamanı son kullanım zamanıdır
      sessions: list.map((s) => ({ id: s.id, device: deviceName(s.userAgent), lastUsedAt: s.createdAt.toISOString(), current: s.id === sid })),
    };
  });

  const passwordSchema = z.object({ password: z.string().min(1).max(200) });
  app.post('/api/me/mfa/setup', { preHandler: app.authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const user = await me(req);
    await requirePassword(user, parse(passwordSchema, req.body).password);
    const secret = newTotpSecret();
    await db.update(users).set({ totpPending: encryptSecret(secret, env.JWT_SECRET) }).where(eq(users.id, user.id));
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  });

  const codeSchema = z.object({ code: z.string().trim().min(6).max(12) });
  app.post('/api/me/mfa/enable', { preHandler: app.authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const user = await me(req);
    const { code } = parse(codeSchema, req.body);
    const pending = secretOf(user.totpPending);
    if (!pending) throw badRequest('Önce kurulumu başlatın.');
    const step = verifyTotp(pending, code);
    if (step == null) throw badRequest('Kod hatalı. Uygulamadaki güncel kodu girin.');
    const now = new Date();
    const [updated] = await db
      .update(users)
      .set({ totpSecret: user.totpPending, totpPending: null, totpEnabledAt: now, totpLastStep: step })
      .where(eq(users.id, user.id))
      .returning();
    const recoveryCodes = await newRecovery(user.id);
    // Platform yöneticisinin erişim anahtarı "doğrulama açık" bilgisiyle yenilenir
    return { recoveryCodes, accessToken: tools.accessToken(updated!, accessUser(req).sid ?? '') };
  });

  app.post('/api/me/mfa/recovery-codes', { preHandler: app.authenticate, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    const user = await me(req);
    await requirePassword(user, parse(passwordSchema, req.body).password);
    if (!user.totpSecret) throw badRequest('İki adımlı doğrulama kapalı.');
    return { recoveryCodes: await newRecovery(user.id) };
  });

  app.post('/api/me/mfa/disable', { preHandler: app.authenticate, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    const user = await me(req);
    if (mfaRequired(user)) throw forbidden('Platform hesabında iki adımlı doğrulama kapatılamaz.');
    await requirePassword(user, parse(passwordSchema, req.body).password);
    await clearMfa(user.id);
    return { ok: true };
  });

  // ——— Oturumlarım ———
  app.delete('/api/me/sessions/:id', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub, sid } = accessUser(req);
    const { id } = req.params as { id: string };
    if (id === sid) throw badRequest('Bu cihazdan çıkmak için Çıkış yap düğmesini kullanın.');
    const [row] = await db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, sub))).returning({ id: sessions.id });
    if (!row) throw notFound('Oturum bulunamadı.');
    return reply.status(204).send();
  });

  /** Bu cihaz dışındaki bütün oturumlar kapanır; hatırlanan cihazlar da unutulur (yeni girişte kod sorulur) */
  app.post('/api/me/sessions/others', { preHandler: app.authenticate }, async (req) => {
    const { sub, sid } = accessUser(req);
    const closed = await db
      .delete(sessions)
      .where(sid ? and(eq(sessions.userId, sub), ne(sessions.id, sid)) : eq(sessions.userId, sub))
      .returning({ id: sessions.id });
    await db.delete(trustedDevices).where(eq(trustedDevices.userId, sub));
    return { closed: closed.length };
  });

  return { needsCode, mfaChallenge, clearMfa, checkSecondFactor };
}
