import { branchIsVocational, changePasswordSchema, effectivePermissions, schoolFullName, isInternshipSubject, loginSchema, pushTokenSchema, updateProfileSchema } from '@okulpano/shared';
import { and, asc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { accessUser } from '../context.ts';
import { accountLinks, memberships, notifications, pushTokens, schools, sessions, teacherBranches, teachers, teacherTitles, timetableEntries, users } from '../db/schema.ts';
import { burnPasswordCheck, hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto.ts';
import { dropLinksTo } from '../lib/accountLinks.ts';
import { clearFailures, lockedFor, noteFailure } from '../lib/loginLock.ts';
import { badRequest, conflict, HttpError, notFound, parse, unauthorized } from '../lib/errors.ts';

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const COOKIE = 'op_refresh';

/** Adres başına geniş sınır: aynı okul ağından dakikada en çok 120 giriş denemesi */
const ipHits = new Map<string, { n: number; start: number }>();
async function loginIpLimit(req: FastifyRequest) {
  const now = Date.now();
  const h = ipHits.get(req.ip);
  const cur = h && now - h.start < 60_000 ? h : { n: 0, start: now };
  cur.n += 1;
  ipHits.set(req.ip, cur);
  if (ipHits.size > 10_000) for (const [k, v] of ipHits) if (now - v.start > 60_000) ipHits.delete(k);
  if (cur.n > 120) throw new HttpError(429, 'Bu ağdan çok sayıda giriş denendi. Bir dakika sonra yeniden deneyin.', 'too_many');
}

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

  async function issueSession(req: FastifyRequest, userId: string, viaUserId: string | null = null) {
    const refreshToken = randomToken('rt');
    await db.insert(sessions).values({
      userId,
      viaUserId,
      tokenHash: sha256(refreshToken),
      userAgent: req.headers['user-agent']?.slice(0, 200) ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return refreshToken;
  }

  function accessToken(user: { id: string; isSuperAdmin: boolean }) {
    return app.jwt.sign({ typ: 'access', sub: user.id, sa: user.isSuperAdmin }, { expiresIn: ACCESS_TTL });
  }

  /*
   * Giriş hız sınırı: okul ağında bütün öğretmenler aynı internet adresinden çıkar. Sınır yalnızca adrese bağlı olsaydı
   * sabah aynı dakikada giriş yapan okul engellenirdi. Bu yüzden adres + e-posta başına 10/dk, adres başına geniş 120/dk;
   * ayrıca bir hesaba art arda 5 hatalı girişte o hesap 5 dakika bekletilir (şifre deneme saldırısı).
   */
  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => `${req.ip}|${String((req.body as { email?: unknown } | undefined)?.email ?? '').toLowerCase().slice(0, 200)}`,
        },
      },
      preHandler: loginIpLimit,
    },
    async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const email = body.email.toLowerCase();
    const wait = await lockedFor(db, email);
    if (wait > 0) throw new HttpError(429, `Bu hesapla çok sayıda hatalı giriş denendi. ${Math.ceil(wait / 60)} dakika sonra yeniden deneyin.`, 'too_many');
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      await burnPasswordCheck(body.password);
      await noteFailure(db, email);
      throw unauthorized('E-posta ya da şifre hatalı.');
    }
    if (!(await verifyPassword(body.password, user.passwordHash))) {
      await noteFailure(db, email);
      throw unauthorized('E-posta ya da şifre hatalı.');
    }
    await clearFailures(db, email);

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    const refreshToken = await issueSession(req, user.id);
    setRefreshCookie(reply, refreshToken);
    return {
      accessToken: accessToken(user),
      ...(body.client === 'mobile' ? { refreshToken } : {}),
    };
    },
  );

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
    // Hesap geçişiyle açılmış oturum yenilenince de "Platform hesabına dön" bilgisi korunur
    const refreshToken = await issueSession(req, user.id, session.viaUserId);
    setRefreshCookie(reply, refreshToken);
    return {
      accessToken: accessToken(user),
      ...(typeof fromBody === 'string' ? { refreshToken } : {}),
    };
  });

  /**
   * Panelden uygulamanın web sürümüne (/app) geçiş: paneldeki oturumla (yalnızca çerez) aynı kişiye ayrı bir
   * oturum açılır ve yenileme anahtarı döner; /app bunu kendi deposuna yazar, kişi ikinci kez giriş yapmaz.
   * Çerez SameSite=lax olduğu için başka sitelerden gelen istekte gönderilmez; özel başlık da ön kontrol (CORS)
   * gerektirir ve sunucu başka kökene izin vermez. Paneldeki oturum değişmez.
   */
  app.post('/api/auth/app-session', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    if (req.headers['x-okul-handoff'] !== '1') throw unauthorized();
    const token = req.cookies[COOKIE];
    if (!token) throw unauthorized();
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())));
    if (!session) throw unauthorized('Oturumun süresi doldu, lütfen yeniden giriş yapın.');
    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    if (!user) throw unauthorized();
    return { userId: user.id, refreshToken: await issueSession(req, user.id) };
  });

  /**
   * Telefonda kayıtlı, o an açık olmayan hesap (hızlı hesap geçişi): yenileme anahtarıyla doğrulanır, anahtar
   * değişmez. link/unlink: bu telefonun bildirimleri o hesaba gelsin ya da gelmesin; summary: okunmamış bildirim sayısı.
   */
  const deviceAccountSchema = z.object({
    refreshToken: z.string().min(10).max(300),
    op: z.enum(['link', 'unlink', 'summary']),
    token: pushTokenSchema.shape.token.optional(),
    platform: z.enum(['android', 'ios', 'web']).optional(),
  });
  app.post('/api/auth/device-account', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(deviceAccountSchema, req.body);
    const [session] = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, sha256(body.refreshToken)), gt(sessions.expiresAt, new Date())));
    if (!session) throw unauthorized('Oturumun süresi doldu, lütfen yeniden giriş yapın.');
    if (body.op === 'summary') {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, session.userId), isNull(notifications.readAt)));
      return { unread: row?.n ?? 0 };
    }
    if (!body.token) throw badRequest('Telefon anahtarı gerekli.');
    if (body.op === 'unlink') {
      await db.delete(pushTokens).where(and(eq(pushTokens.token, body.token), eq(pushTokens.userId, session.userId)));
    } else {
      await db
        .insert(pushTokens)
        .values({ userId: session.userId, token: body.token, platform: body.platform ?? 'android' })
        .onConflictDoUpdate({ target: [pushTokens.token, pushTokens.userId], set: { platform: body.platform ?? 'android' } });
    }
    return { ok: true };
  });

  /*
   * Platform yöneticisinin web hesap geçişi (yalnızca platform yöneticisi rolü; e-postaya bağlı değildir).
   * Platform hesabı kendi okul hesabını bir kez o hesabın e-posta ve şifresiyle bağlar; sonra tek dokunuşla geçer.
   * Geçişle açılan okul oturumunda geçişi yapan platform hesabı işaretlenir; "Platform hesabına dön" yalnızca o
   * oturumda çalışır. Doğrulama 12 saatten eskiyse geçişte platform hesabının şifresi yeniden sorulur.
   * Uç noktalar yalnızca panel çereziyle çalışır ve özel başlık ister (başka siteden istek gönderilemez).
   * Platform ile okul ayrı kalır: okul hesabı ayrı bir kullanıcıdır, platform hesabı okula üye olmaz (KVKK).
   */
  const LINK_FRESH_MS = 12 * 3600 * 1000;
  const linkSchema = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });
  const switchSchema = z.object({ password: z.string().min(1).max(200).optional() });

  async function cookieSession(req: FastifyRequest) {
    if (req.headers['x-okul-switch'] !== '1') throw unauthorized();
    const token = req.cookies[COOKIE];
    if (!token) throw unauthorized();
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())));
    if (!session) throw unauthorized('Oturumun süresi doldu, lütfen yeniden giriş yapın.');
    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    if (!user) throw unauthorized();
    return { session, user };
  }

  /** Okul hesabının ilk okulu (türüyle) ya da hiç üyeliği yoksa null */
  async function firstSchoolName(userId: string) {
    const [row] = await db
      .select({ name: schools.name, settings: schools.settings })
      .from(memberships)
      .innerJoin(schools, eq(schools.id, memberships.schoolId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(memberships.createdAt))
      .limit(1);
    return row ? schoolFullName(row.name, row.settings?.schoolType) : null;
  }

  type Ctx = Awaited<ReturnType<typeof cookieSession>>;
  /** Bu oturum için bağlantı: platform hesabındaysa kendi bağlantısı, okul hesabındaysa geçişle geldiği bağlantı */
  async function linkFor({ session, user }: Ctx) {
    if (user.isSuperAdmin) {
      const [link] = await db.select().from(accountLinks).where(eq(accountLinks.platformUserId, user.id));
      return link ? { link, side: 'platform' as const } : null;
    }
    if (!session.viaUserId) return null;
    const [link] = await db
      .select()
      .from(accountLinks)
      .where(and(eq(accountLinks.platformUserId, session.viaUserId), eq(accountLinks.schoolUserId, user.id)));
    return link ? { link, side: 'school' as const } : null;
  }

  async function linkStatus(ctx: Ctx) {
    const found = await linkFor(ctx);
    if (!found) return { side: ctx.user.isSuperAdmin ? ('platform' as const) : ('none' as const), linked: false };
    const otherId = found.side === 'platform' ? found.link.schoolUserId : found.link.platformUserId;
    const [other] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, otherId));
    return {
      side: found.side,
      linked: true,
      name: other?.fullName ?? '',
      schoolName: await firstSchoolName(found.link.schoolUserId),
      needsPassword: Date.now() - found.link.verifiedAt.getTime() > LINK_FRESH_MS,
    };
  }

  app.get('/api/auth/linked-account', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => linkStatus(await cookieSession(req)));

  app.post('/api/auth/linked-account', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const ctx = await cookieSession(req);
    if (!ctx.user.isSuperAdmin) throw new HttpError(403, 'Bu işlem yalnızca platform yöneticisine açıktır.', 'forbidden');
    const body = parse(linkSchema, req.body);
    const email = body.email.toLowerCase();
    const wait = await lockedFor(db, email);
    if (wait > 0) throw new HttpError(429, `Bu hesapla çok sayıda hatalı giriş denendi. ${Math.ceil(wait / 60)} dakika sonra yeniden deneyin.`, 'too_many');
    const [target] = await db.select().from(users).where(eq(users.email, email));
    if (!target) {
      await burnPasswordCheck(body.password);
      await noteFailure(db, email);
      throw badRequest('E-posta ya da şifre hatalı.');
    }
    if (!(await verifyPassword(body.password, target.passwordHash))) {
      await noteFailure(db, email);
      throw badRequest('E-posta ya da şifre hatalı.');
    }
    await clearFailures(db, email);
    if (target.isSuperAdmin) throw badRequest('Platform hesabı bağlanamaz; okul hesabınızı girin.');
    if (!(await firstSchoolName(target.id))) throw badRequest('Bu hesap hiçbir okula bağlı değil.');
    const now = new Date();
    await db
      .insert(accountLinks)
      .values({ platformUserId: ctx.user.id, schoolUserId: target.id, verifiedAt: now })
      .onConflictDoUpdate({ target: accountLinks.platformUserId, set: { schoolUserId: target.id, verifiedAt: now } });
    return linkStatus(ctx);
  });

  app.delete('/api/auth/linked-account', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const ctx = await cookieSession(req);
    if (!ctx.user.isSuperAdmin) throw new HttpError(403, 'Bu işlem yalnızca platform yöneticisine açıktır.', 'forbidden');
    await db.delete(accountLinks).where(eq(accountLinks.platformUserId, ctx.user.id));
    // Bu bağlantıyla açılmış okul oturumlarının geri dönüş işareti de geçersizleşir
    await db.update(sessions).set({ viaUserId: null }).where(eq(sessions.viaUserId, ctx.user.id));
    return reply.status(204).send();
  });

  app.post('/api/auth/switch-account', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const ctx = await cookieSession(req);
    const body = parse(switchSchema, req.body ?? {});
    const found = await linkFor(ctx);
    if (!found) throw new HttpError(403, 'Bağlı hesap yok.', 'forbidden');
    const { link, side } = found;
    const [platformUser] = await db.select().from(users).where(eq(users.id, link.platformUserId));
    const [schoolUser] = await db.select().from(users).where(eq(users.id, link.schoolUserId));
    if (!platformUser?.isSuperAdmin || !schoolUser || schoolUser.isSuperAdmin) throw new HttpError(403, 'Bağlı hesap artık kullanılamıyor.', 'forbidden');
    if (side === 'platform' && !(await firstSchoolName(schoolUser.id))) throw new HttpError(403, 'Okul hesabınız hiçbir okula bağlı değil.', 'forbidden');

    if (Date.now() - link.verifiedAt.getTime() > LINK_FRESH_MS) {
      // Kimliği yeniden doğrulayan, platform hesabının şifresidir (iki yönde de)
      if (!body.password) throw new HttpError(403, 'Güvenlik için platform hesabınızın şifresini girin.', 'reauth');
      const key = platformUser.email;
      const wait = await lockedFor(db, key);
      if (wait > 0) throw new HttpError(429, `Çok sayıda hatalı şifre denendi. ${Math.ceil(wait / 60)} dakika sonra yeniden deneyin.`, 'too_many');
      if (!(await verifyPassword(body.password, platformUser.passwordHash))) {
        await noteFailure(db, key);
        throw new HttpError(403, 'Şifre hatalı.', 'reauth');
      }
      await clearFailures(db, key);
      await db.update(accountLinks).set({ verifiedAt: new Date() }).where(eq(accountLinks.id, link.id));
    }

    const target = side === 'platform' ? schoolUser : platformUser;
    await db.delete(sessions).where(eq(sessions.id, ctx.session.id));
    const refreshToken = await issueSession(req, target.id, side === 'platform' ? platformUser.id : null);
    setRefreshCookie(reply, refreshToken);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, target.id));
    return { accessToken: accessToken(target) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
    const token = typeof fromBody === 'string' ? fromBody : req.cookies[COOKIE];
    if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
    reply.clearCookie(COOKIE, { path: '/api/auth' });
    return reply.status(204).send();
  });

  /**
   * Platform yöneticisinin panelde açabildiği okullar: üyesi olduğu (kendi) okulları ve okul müdürünün süreli
   * destek erişimi verdiği okullar (KVKK). Diğer okulların yalnızca kayıt bilgileri Platform sayfasında görünür.
   */
  async function superAdminSchools(userId: string) {
    const own = await db
      .select({ school: schools, role: memberships.role, permissions: memberships.permissions, teacherId: memberships.teacherId })
      .from(memberships)
      .innerJoin(schools, eq(schools.id, memberships.schoolId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(schools.name));
    const ownIds = new Set(own.map((r) => r.school.id));
    const support = (await db.select().from(schools).where(gt(schools.supportAccessUntil, new Date())).orderBy(asc(schools.name)))
      .filter((s) => !ownIds.has(s.id))
      .map((school) => ({ school, role: 'owner' as const, permissions: [] as string[], teacherId: null as string | null, support: true }));
    return [...own, ...support];
  }

  app.get('/api/me', { preHandler: app.authenticate }, async (req) => {
    const { sub } = accessUser(req);
    const [user] = await db
      .select({ id: users.id, email: users.email, fullName: users.fullName, isSuperAdmin: users.isSuperAdmin, lastSchoolId: users.lastSchoolId })
      .from(users)
      .where(eq(users.id, sub));
    if (!user) throw unauthorized();
    const { lastSchoolId, ...profile } = user;

    const rows = user.isSuperAdmin
      ? await superAdminSchools(sub)
      : await db
          .select({ school: schools, role: memberships.role, permissions: memberships.permissions, teacherId: memberships.teacherId })
          .from(memberships)
          .innerJoin(schools, eq(schools.id, memberships.schoolId))
          .where(eq(memberships.userId, sub))
          .orderBy(asc(schools.name));

    // Öğretmen kaydına bağlı üyelikler: kadrodaki ünvan (ör. Müdür Yardımcısı) ve meslek öğretmeni mi
    // (branşı meslek alanı ya da programında işletmelerde mesleki eğitim dersi var)
    const teacherIds = rows.map((r) => r.teacherId).filter((x): x is string => Boolean(x));
    const info = new Map<string, { title: string | null; vocational: boolean }>();
    if (teacherIds.length) {
      const [rowsT, internship] = await Promise.all([
        db
          .select({ id: teachers.id, title: teacherTitles.name, branchName: teacherBranches.name, branchVocational: teacherBranches.vocational })
          .from(teachers)
          .leftJoin(teacherTitles, eq(teacherTitles.id, teachers.titleId))
          .leftJoin(teacherBranches, eq(teacherBranches.id, teachers.branchId))
          .where(inArray(teachers.id, teacherIds)),
        db
          .selectDistinct({ teacherId: timetableEntries.teacherId, subject: timetableEntries.subject })
          .from(timetableEntries)
          .where(inArray(timetableEntries.teacherId, teacherIds)),
      ]);
      const teachesInternship = new Set(internship.filter((x) => isInternshipSubject(x.subject)).map((x) => x.teacherId));
      for (const t of rowsT)
        info.set(t.id, {
          title: t.title?.trim() || null,
          vocational: (t.branchName ? branchIsVocational({ name: t.branchName, vocational: t.branchVocational }) : false) || teachesInternship.has(t.id),
        });
    }

    return {
      user: profile,
      /** Açılışta seçilecek okul: en son açılan, yoksa listenin ilki */
      lastSchoolId: rows.some((r) => r.school.id === lastSchoolId) ? lastSchoolId : null,
      schools: rows.map((r) => ({
        id: r.school.id,
        name: r.school.name,
        /** Genel Ayarlar › Okul türü (boşsa addan ayrılır) */
        schoolType: ((r.school.settings ?? {}) as { schoolType?: string }).schoolType?.trim() || null,
        slug: r.school.slug,
        logoUrl: r.school.logoUrl,
        isActive: r.school.isActive,
        role: r.role,
        permissions: effectivePermissions(r.role, r.permissions),
        teacherId: r.teacherId,
        /** Öğretmen kadrosundaki ünvan (Müdür Yardımcısı, Uzman Öğretmen…); kayıt yoksa ya da ünvan girilmemişse null */
        teacherTitle: r.teacherId ? (info.get(r.teacherId)?.title ?? null) : null,
        /** Meslek öğretmeni: branşı meslek alanı ya da işletmelerde mesleki eğitim dersi var */
        vocational: r.teacherId ? (info.get(r.teacherId)?.vocational ?? false) : false,
        /** Üyelik yok, okulun verdiği süreli destek erişimi */
        support: 'support' in r ? true : undefined,
      })),
    };
  });

  /** Seçilen okulu hatırlar (panelde ya da mobilde okul değiştirildiğinde) */
  app.put('/api/me/school', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub, sa } = accessUser(req);
    const { schoolId } = parse(z.object({ schoolId: z.string().uuid() }), req.body);
    const [allowed] = sa
      ? await db.select({ id: schools.id }).from(schools).where(eq(schools.id, schoolId))
      : await db
          .select({ id: memberships.schoolId })
          .from(memberships)
          .where(and(eq(memberships.userId, sub), eq(memberships.schoolId, schoolId)));
    if (!allowed) throw notFound();
    await db.update(users).set({ lastSchoolId: schoolId }).where(eq(users.id, sub));
    return reply.status(204).send();
  });

  /** Profil: ad ve e-posta. E-posta değişikliği mevcut şifreyle onaylanır (hesap ele geçirmeye karşı). */
  app.patch('/api/me', { preHandler: app.authenticate }, async (req) => {
    const { sub } = accessUser(req);
    const body = parse(updateProfileSchema, req.body);
    const [user] = await db.select().from(users).where(eq(users.id, sub));
    if (!user) throw unauthorized();
    const email = body.email?.toLowerCase();
    if (email && email !== user.email) {
      if (!body.currentPassword || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
        throw badRequest('E-postayı değiştirmek için mevcut şifrenizi doğru girin.');
      }
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (taken) throw conflict('Bu e-posta başka bir hesapta kullanılıyor.');
    }
    const [updated] = await db
      .update(users)
      .set({ ...(body.fullName ? { fullName: body.fullName } : {}), ...(email ? { email } : {}) })
      .where(eq(users.id, sub))
      .returning({ id: users.id, email: users.email, fullName: users.fullName, isSuperAdmin: users.isSuperAdmin });
    return updated;
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
    // Diğer cihazlardaki oturumları kapat; eski şifreyle kurulmuş hesap bağlantısı da kalkar
    await db.delete(sessions).where(eq(sessions.userId, sub));
    await dropLinksTo(db, sub);
    const refreshToken = await issueSession(req, sub);
    setRefreshCookie(reply, refreshToken);
    // Mobil uygulama çerez kullanmaz: oturumu sürdürmek için yeni anahtarı yanıttan alır
    const mobile = (req.body as { client?: unknown } | undefined)?.client === 'mobile';
    return mobile ? { ok: true, refreshToken } : { ok: true };
  });
}
