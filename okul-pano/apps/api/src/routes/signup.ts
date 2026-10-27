import { acceptInviteSchema, dueTrialReminder, signupSchema, slugify, tokenSchema, trialStatus } from '@okulpano/shared';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../context.ts';
import { accessUser, UUID_RE } from '../context.ts';
import { memberships, schools, sessions, signups, userInvites, users } from '../db/schema.ts';
import { hashPassword, randomToken, sha256 } from '../lib/crypto.ts';
import { sendMail } from '../lib/mailer.ts';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors.ts';
import { addDefaultTeacherOptions } from './teachers.ts';

const SIGNUP_TTL_MS = 48 * 3600_000;
export const INVITE_TTL_MS = 7 * 86400_000;

const panelUrl = (deps: AppDeps, path = '') => `${deps.env.PUBLIC_URL.replace(/\/$/, '')}/admin/${path}`;

/** Kullanıcı daveti: tek kullanımlık bağlantı üretir, e-postayla gönderir; gönderilemezse bağlantı panelde gösterilir */
export async function createInvite(
  deps: AppDeps,
  opts: { userId: string; schoolId: string; schoolName: string; email: string; fullName: string; createdBy: string },
): Promise<{ inviteUrl: string; emailed: boolean }> {
  const token = randomToken('inv');
  await deps.db.delete(userInvites).where(and(eq(userInvites.userId, opts.userId), isNull(userInvites.usedAt)));
  await deps.db.insert(userInvites).values({
    userId: opts.userId,
    schoolId: opts.schoolId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    createdBy: opts.createdBy,
  });
  const inviteUrl = panelUrl(deps, `davet?token=${encodeURIComponent(token)}`);
  const emailed = await sendMail(deps.env, {
    to: opts.email,
    subject: `${opts.schoolName} · Panokul daveti`,
    text: `Merhaba ${opts.fullName},\n\n${opts.schoolName} sizi Panokul yönetim paneline davet etti.\n\nŞifrenizi belirleyip giriş yapmak için bağlantıyı açın (7 gün geçerli):\n${inviteUrl}\n\nMobil uygulamaya da aynı e-posta ve şifreyle giriş yapabilirsiniz.\n`,
  }).catch(() => false);
  return { inviteUrl, emailed };
}

/** Kayıt başvurusundan okulu açar: okul deneme paketiyle, başvuran okul sahibi olarak */
async function openSchool(deps: AppDeps, signup: typeof signups.$inferSelect, active: boolean) {
  const { db, env } = deps;
  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, signup.email));
    if (taken) throw conflict('Bu e-posta ile zaten bir hesap var. Giriş yapın.');
    const base = slugify(signup.schoolName) || 'okul';
    let slug = base;
    for (let i = 0; i < 5; i++) {
      const [s] = await tx.select({ id: schools.id }).from(schools).where(eq(schools.slug, slug));
      if (!s) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const [school] = await tx
      .insert(schools)
      .values({
        name: signup.schoolName,
        slug,
        city: signup.city,
        plan: 'trial',
        maxScreens: env.TRIAL_SCREENS,
        trialEndsAt: new Date(Date.now() + env.TRIAL_DAYS * 86400_000),
        isActive: active,
        contactPhone: signup.phone,
        settings: { schoolType: signup.schoolType },
      })
      .returning();
    const [owner] = await tx
      .insert(users)
      .values({ email: signup.email, fullName: signup.ownerName, passwordHash: signup.passwordHash })
      .returning();
    await tx.insert(memberships).values({ userId: owner!.id, schoolId: school!.id, role: 'owner' });
    await addDefaultTeacherOptions(tx, school!.id);
    await tx.update(signups).set({ verifiedAt: new Date(), schoolId: school!.id }).where(eq(signups.id, signup.id));
    return school!;
  });
}

/**
 * Web'den kayıt (yalnızca panel; mobil uygulamada kayıt yok), e-posta doğrulama, platform yöneticisinin
 * başvuru listesi ve kullanıcı davetinin kabulü. Kayıtla açılan okul deneme paketindedir.
 */
export async function signupRoutes(app: FastifyInstance) {
  const deps = app.deps;
  const { db, env } = deps;

  /** Kayıt formunun ihtiyaç duyduğu ayar: kayıt açık mı, deneme kaç gün */
  app.get('/api/signup/config', async () => ({ mode: env.SIGNUP_MODE, trialDays: env.TRIAL_DAYS, trialScreens: env.TRIAL_SCREENS }));

  app.post('/api/signup', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    if (env.SIGNUP_MODE === 'closed') throw forbidden('Şu an yeni kayıt alınmıyor. Bizimle iletişime geçin.');
    const body = parse(signupSchema, req.body);
    // Bot tuzağı doluysa kayıt yapılmış gibi davranılır
    if (body.website) return reply.status(202).send({ emailed: true });
    const email = body.email.toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing) throw conflict('Bu e-posta ile zaten bir hesap var. Giriş yapın ya da şifrenizi okul yöneticinizden isteyin.');

    // Aynı e-postanın doğrulanmamış eski başvurusu yenisiyle değişir
    await db.delete(signups).where(and(eq(signups.email, email), isNull(signups.verifiedAt)));
    const token = randomToken('sgn');
    await db.insert(signups).values({
      schoolName: body.schoolName,
      city: body.city,
      district: body.district ?? null,
      schoolType: body.schoolType,
      ownerName: body.ownerName,
      email,
      phone: body.phone,
      passwordHash: await hashPassword(body.password),
      marketingConsent: body.marketing,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SIGNUP_TTL_MS),
      ip: req.ip,
    });
    const url = panelUrl(deps, `dogrula?token=${encodeURIComponent(token)}`);
    const emailed = await sendMail(env, {
      to: email,
      subject: 'Panokul · e-posta adresinizi doğrulayın',
      text: `Merhaba ${body.ownerName},\n\n${body.schoolName} için Panokul kaydınızı tamamlamak üzere bağlantıyı açın (48 saat geçerli):\n${url}\n\nBu kaydı siz yapmadıysanız e-postayı yok sayın.\n`,
    }).catch(() => false);
    return reply.status(202).send({ emailed });
  });

  app.post('/api/signup/verify', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { token } = parse(tokenSchema, req.body);
    const [signup] = await db.select().from(signups).where(eq(signups.tokenHash, sha256(token)));
    if (!signup) throw notFound('Bağlantı geçersiz. Kaydı yeniden yapın.');
    if (signup.verifiedAt) return { schoolName: signup.schoolName, email: signup.email, pendingApproval: false, alreadyVerified: true };
    if (signup.expiresAt < new Date()) throw badRequest('Bağlantının süresi dolmuş. Kaydı yeniden yapın.');
    const pendingApproval = env.SIGNUP_MODE === 'approval';
    await openSchool(deps, signup, !pendingApproval);
    return { schoolName: signup.schoolName, email: signup.email, pendingApproval, alreadyVerified: false };
  });

  /* ---------- Platform yöneticisi: e-postası doğrulanmamış başvurular ---------- */

  const platform = {
    preHandler: [
      app.authenticate,
      async (req: Parameters<typeof app.authenticate>[0]) => {
        if (!accessUser(req).sa) throw forbidden();
      },
    ],
  };

  app.get('/api/platform/signups', platform, async () => {
    await db.delete(signups).where(and(isNull(signups.verifiedAt), lt(signups.createdAt, new Date(Date.now() - 30 * 86400_000))));
    const rows = await db.select().from(signups).where(isNull(signups.verifiedAt)).orderBy(desc(signups.createdAt));
    return rows.map(({ passwordHash: _p, tokenHash: _t, ...r }) => ({ ...r, expired: r.expiresAt < new Date() }));
  });

  /** E-posta ulaşmadıysa (ör. SMTP kurulmadı) başvuruyu elle onaylar: okul açılır, başvuran kendi şifresiyle girer */
  app.post('/api/platform/signups/:id/approve', platform, async (req) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const [signup] = await db.select().from(signups).where(and(eq(signups.id, id), isNull(signups.verifiedAt)));
    if (!signup) throw notFound('Başvuru bulunamadı.');
    const school = await openSchool(deps, signup, true);
    await sendMail(env, {
      to: signup.email,
      subject: 'Panokul · okulunuz hazır',
      text: `Merhaba ${signup.ownerName},\n\n${signup.schoolName} için Panokul hesabınız açıldı. Kayıtta belirlediğiniz şifreyle giriş yapabilirsiniz:\n${panelUrl(deps)}\n`,
    }).catch(() => false);
    return { schoolId: school.id };
  });

  app.delete('/api/platform/signups/:id', platform, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    await db.delete(signups).where(and(eq(signups.id, id), isNull(signups.verifiedAt)));
    return reply.status(204).send();
  });

  /* ---------- Kullanıcı daveti: kişi şifresini kendisi belirler ---------- */

  async function loadInvite(token: string) {
    const [row] = await db
      .select({ invite: userInvites, email: users.email, fullName: users.fullName, schoolName: schools.name })
      .from(userInvites)
      .innerJoin(users, eq(users.id, userInvites.userId))
      .innerJoin(schools, eq(schools.id, userInvites.schoolId))
      .where(and(eq(userInvites.tokenHash, sha256(token)), isNull(userInvites.usedAt), gt(userInvites.expiresAt, new Date())));
    if (!row) throw notFound('Davet bağlantısı geçersiz ya da süresi dolmuş. Okul yöneticinizden yeni davet isteyin.');
    return row;
  }

  app.get('/api/invites/:token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { token } = parse(tokenSchema, req.params);
    const row = await loadInvite(token);
    return { email: row.email, fullName: row.fullName, schoolName: row.schoolName };
  });

  app.post('/api/invites/accept', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(acceptInviteSchema, req.body);
    const row = await loadInvite(body.token);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: await hashPassword(body.password) }).where(eq(users.id, row.invite.userId));
      await tx.update(userInvites).set({ usedAt: new Date() }).where(eq(userInvites.id, row.invite.id));
      await tx.delete(sessions).where(eq(sessions.userId, row.invite.userId));
    });
    return { email: row.email };
  });
}

/**
 * Deneme süresi hatırlatmaları: bitişe 7, 3, 1 gün kala ve bitince okul sahiplerine birer e-posta.
 * Sunucu açılışta ve saatte bir çalıştırır; her eşik bir kez gönderilir.
 */
export async function runTrialReminders(deps: AppDeps, now = Date.now()): Promise<number> {
  const { db, env } = deps;
  const rows = await db
    .select({ id: schools.id, name: schools.name, plan: schools.plan, trialEndsAt: schools.trialEndsAt, trialNotice: schools.trialNotice })
    .from(schools)
    .where(and(eq(schools.plan, 'trial'), eq(schools.isActive, true)));
  let sent = 0;
  for (const s of rows) {
    const status = trialStatus(s, now);
    const due = dueTrialReminder(status, s.trialNotice);
    if (due === null || !status) continue;
    const owners = await db
      .select({ email: users.email, fullName: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.schoolId, s.id), eq(memberships.role, 'owner')));
    const when = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(new Date(status.endsAt));
    for (const o of owners) {
      await sendMail(env, {
        to: o.email,
        subject: due === 0 ? `${s.name} · Panokul deneme süreniz doldu` : `${s.name} · Panokul denemenizin bitmesine ${due} gün kaldı`,
        text:
          due === 0
            ? `Merhaba ${o.fullName},\n\n${s.name} için Panokul deneme süresi ${when} tarihinde doldu. Panel salt okunur, panolarda içerik gösterilmiyor. Verileriniz 30 gün saklanır.\n\nAboneliği başlatmak için bizimle iletişime geçin.\n`
            : `Merhaba ${o.fullName},\n\n${s.name} için Panokul deneme süreniz ${when} tarihinde bitiyor. Kesintisiz devam etmek için aboneliği başlatın; bütün içerikleriniz olduğu gibi kalır.\n`,
      }).catch(() => false);
    }
    await db.update(schools).set({ trialNotice: due }).where(eq(schools.id, s.id));
    sent++;
  }
  return sent;
}
