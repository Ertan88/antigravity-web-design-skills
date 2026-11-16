import { and, asc, count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessUser } from '../context.ts';
import { auditLogs, memberships, schools, sessions, users } from '../db/schema.ts';
import { hashPassword, readablePassword, verifyPassword } from '../lib/crypto.ts';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors.ts';
import { trySendMail } from '../lib/mailer.ts';
import { INVITE_PENDING } from './members.ts';

const findSchema = z.object({ email: z.email('Geçerli bir e-posta girin').max(160) });

/**
 * Platform yöneticisi: hesabı tam e-postayla bulur (hesaplar toplu listelenmez, KVKK), hangi okulda hangi rolde olduğunu
 * gösterir; okul müdürü olmayan hesabı siler ya da yeni şifre verir. Örnek kurulumdan ya da okulsuz kalan hesaplar için.
 */
export async function platformAccountsRoutes(app: FastifyInstance) {
  const { db, env } = app.deps;
  const platform = {
    preHandler: [
      app.authenticate,
      async (req: Parameters<typeof app.authenticate>[0]) => {
        if (!accessUser(req).sa) throw forbidden();
      },
    ],
  };

  const load = async (id: string) => {
    if (!z.uuid().safeParse(id).success) throw notFound('Hesap bulunamadı.');
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) throw notFound('Hesap bulunamadı.');
    const schoolsOf = await db
      .select({ schoolId: schools.id, schoolName: schools.name, role: memberships.role })
      .from(memberships)
      .innerJoin(schools, eq(schools.id, memberships.schoolId))
      .where(eq(memberships.userId, id))
      .orderBy(asc(schools.name));
    // Eski kayıtlarda bir okulda birden fazla müdür olabilir: hesap okulun tek müdürü değilse silinebilir
    const withOwners = await Promise.all(
      schoolsOf.map(async (m) => {
        if (m.role !== 'owner') return { ...m, soleOwner: false };
        const [{ n }] = (await db.select({ n: count() }).from(memberships).where(and(eq(memberships.schoolId, m.schoolId), eq(memberships.role, 'owner')))) as [{ n: number }];
        return { ...m, soleOwner: Number(n) <= 1 };
      }),
    );
    return { user, schoolsOf: withOwners };
  };

  const view = ({ user, schoolsOf }: Awaited<ReturnType<typeof load>>) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isSuperAdmin: user.isSuperAdmin,
    invitePending: user.passwordHash === INVITE_PENDING,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    memberships: schoolsOf,
  });

  const log = async (byUserId: string, schoolIds: string[], action: string, summary: string) => {
    if (schoolIds.length) await db.insert(auditLogs).values(schoolIds.map((schoolId) => ({ schoolId, userId: byUserId, action, entity: 'Hesap', summary: summary.slice(0, 200) })));
  };

  /**
   * Hesap ayrımı (KVKK): platform yöneticisi aynı zamanda bir okulda çalışıyorsa platform yetkisi yeni bir hesaba
   * (başka e-posta) taşınır. Mevcut hesap okul hesabı olarak kalır: okuldaki bütün kayıtları (izin, bildirim, öğretmen
   * eşleşmesi, geçmiş) yerinde durur, platform görünümü kapanır. Uygulamada iki hesap arasında hızlı geçiş yapılır.
   */
  const splitSchema = z.object({
    email: z.email('Geçerli bir e-posta girin').max(160),
    password: z.string().min(8, 'Şifre en az 8 karakter olmalı').max(200),
    currentPassword: z.string().min(1, 'Mevcut şifrenizi girin').max(200),
  });
  app.post('/api/platform/split', platform, async (req) => {
    const body = parse(splitSchema, req.body);
    const me = accessUser(req).sub;
    const [user] = await db.select().from(users).where(eq(users.id, me));
    if (!user?.isSuperAdmin) throw forbidden();
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) throw badRequest('Mevcut şifre hatalı.');
    const own = await db.select({ schoolId: memberships.schoolId }).from(memberships).where(eq(memberships.userId, me));
    if (!own.length) throw badRequest('Bu hesap hiçbir okula üye değil; ayırmaya gerek yok.');
    const email = body.email.trim().toLowerCase();
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (taken) throw conflict('Bu e-posta başka bir hesapta kullanılıyor.');
    const [created] = await db.transaction(async (tx) => {
      const rows = await tx.insert(users).values({ email, fullName: user.fullName, passwordHash: await hashPassword(body.password), isSuperAdmin: true }).returning({ id: users.id, email: users.email });
      await tx.update(users).set({ isSuperAdmin: false }).where(eq(users.id, me));
      return rows;
    });
    return { platformEmail: created!.email };
  });

  app.get('/api/platform/accounts', platform, async (req) => {
    const { email } = parse(findSchema, req.query);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.trim().toLowerCase()));
    if (!user) throw notFound('Bu e-postayla kayıtlı hesap yok.');
    return view(await load(user.id));
  });

  app.delete('/api/platform/accounts/:id', platform, async (req, reply) => {
    const a = await load((req.params as { id: string }).id);
    if (a.user.id === accessUser(req).sub) throw badRequest('Kendi hesabınızı buradan silemezsiniz.');
    if (a.user.isSuperAdmin) throw badRequest('Platform yöneticisi hesabı silinemez.');
    const owned = a.schoolsOf.filter((m) => m.soleOwner);
    if (owned.length) throw conflict(`Bu kişi ${owned.map((m) => m.schoolName).join(', ')} okulunun müdürü. Önce okul listesinden "Müdürü değiştir" ile müdürlüğü devredin.`);
    await log(accessUser(req).sub, a.schoolsOf.map((m) => m.schoolId), 'delete', `Platform yöneticisi ${a.user.fullName} (${a.user.email}) hesabını sildi`);
    await db.delete(users).where(eq(users.id, a.user.id));
    return reply.code(204).send();
  });

  /** Yeni geçici şifre: bütün oturumlar kapanır; e-posta ayarlıysa kişiye gönderilir */
  app.post('/api/platform/accounts/:id/password', platform, async (req) => {
    const a = await load((req.params as { id: string }).id);
    if (a.user.isSuperAdmin) throw badRequest('Platform yöneticisinin şifresi Hesabım sayfasından değiştirilir.');
    const password = readablePassword();
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, a.user.id));
    await db.delete(sessions).where(eq(sessions.userId, a.user.id));
    await log(accessUser(req).sub, a.schoolsOf.map((m) => m.schoolId), 'update', `Platform yöneticisi ${a.user.fullName} şifresini yeniledi`);
    const emailed = await trySendMail(env, {
      to: a.user.email,
      subject: 'Okulyayın şifreniz yenilendi',
      text: `Merhaba ${a.user.fullName},\n\nOkulyayın şifreniz yenilendi.\n\nAdres: ${env.PUBLIC_URL.replace(/\/$/, '')}/admin/\nE-posta: ${a.user.email}\nŞifre: ${password}\n\nGiriş yaptıktan sonra Hesabım sayfasından şifrenizi değiştirin.\n`,
    });
    return { password, emailed, email: a.user.email, fullName: a.user.fullName };
  });
}
