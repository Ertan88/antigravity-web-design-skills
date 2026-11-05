import {
  effectivePermissions,
  enrollApproveSchema,
  enrollCodeCreateSchema,
  enrollEmailSchema,
  enrollFinishSchema,
  enrollMeetingSchema,
  enrollMeetingStartSchema,
  enrollStartCodeSchema,
  schoolSettingsSchema,
  trCompare,
  type EnrollRole,
} from '@okulpano/shared';
import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, inArray, isNotNull, ne } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import { enrollments, joinLinks, memberships, schools, teacherBranches, teachers, teacherTitles, users } from '../db/schema.ts';
import { burnPasswordCheck, hashPassword, pairingCode, randomToken, sha256, verifyPassword } from '../lib/crypto.ts';
import { badRequest, conflict, forbidden, notFound, parse, unauthorized } from '../lib/errors.ts';
import { mailConfigured, trySendMail } from '../lib/mailer.ts';
import { tell } from './issues.ts';

/** Kişi başı giriş kodu 15 dakika, toplantı QR'ı 1 saat, adımlar (e-posta, şifre) 30 dakika geçerli */
const CODE_TTL_MS = 15 * 60_000;
const LINK_TTL_MS = 60 * 60_000;
const STEP_TTL_MS = 30 * 60_000;
const EMAIL_CODE_TTL_MS = 10 * 60_000;
const MAX_EMAIL_TRIES = 5;

/** Önerilen rolün üyelik karşılığı */
export function roleToMembership(role: EnrollRole): { role: 'admin' | 'editor'; permissions: string[] } {
  if (role === 'admin') return { role: 'admin', permissions: [] };
  if (role === 'counselor') return { role: 'editor', permissions: effectivePermissions('editor', ['conduct.counsel']) };
  return { role: 'editor', permissions: [] };
}

const membershipToRole = (role: string, permissions: string[]): EnrollRole =>
  role === 'admin' ? 'admin' : permissions.includes('conduct.counsel') ? 'counselor' : 'teacher';

/**
 * Öğretmen hesabı açma. Yetkili kişi başı tek kullanımlık kod verir (A) ya da toplantıda okulun QR'ını gösterir (B).
 * Öğretmen e-postasını (doğrulama koduyla) ve şifresini kendisi girer: ortada yazılı şifre ya da kullanıcı adı olmaz.
 * Kodla açılan hesap hemen kullanılır; QR ile açılan hesap yetkili onaylayınca açılır (başkasının adını seçmeye karşı).
 */
export async function enrollRoutes(app: FastifyInstance) {
  const { db, env } = app.deps;
  const base = '/api/schools/:schoolId/enrollments';
  const manage = { preHandler: [app.authenticate, schoolGuard('users.manage')] };
  const publicLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  const appUrl = () => `${env.PUBLIC_URL.replace(/\/$/, '')}/app/katil`;

  /** Bu okulda hesabı (üyeliği) olan öğretmenler */
  async function linkedTeacherIds(schoolId: string) {
    const rows = await db
      .select({ teacherId: memberships.teacherId })
      .from(memberships)
      .where(and(eq(memberships.schoolId, schoolId), isNotNull(memberships.teacherId)));
    return new Set(rows.map((r) => r.teacherId!));
  }

  async function suggestedRole(schoolId: string, titleId: string | null): Promise<EnrollRole> {
    if (!titleId) return 'teacher';
    const [s] = await db.select({ settings: schools.settings }).from(schools).where(eq(schools.id, schoolId));
    return schoolSettingsSchema.parse(s?.settings ?? {}).titleRoles[titleId] ?? 'teacher';
  }

  async function newStep(enrollmentId: string) {
    const token = randomToken('en', 24);
    await db
      .update(enrollments)
      .set({ stepHash: sha256(token), stepExpiresAt: new Date(Date.now() + STEP_TTL_MS), updatedAt: new Date() })
      .where(eq(enrollments.id, enrollmentId));
    return token;
  }

  async function byStep(token: string) {
    const [e] = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.stepHash, sha256(token)), gt(enrollments.stepExpiresAt, new Date()), eq(enrollments.status, 'waiting')));
    if (!e) throw unauthorized('Sürenin dolduğu ya da kullanılmış bir bağlantı. Yetkiliden yeni kod isteyin.');
    return e;
  }

  async function intro(e: typeof enrollments.$inferSelect) {
    const [s] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, e.schoolId));
    const [t] = e.teacherId ? await db.select({ fullName: teachers.fullName, email: teachers.email }).from(teachers).where(eq(teachers.id, e.teacherId)) : [];
    return { schoolName: s?.name ?? '', fullName: t?.fullName ?? '', suggestedEmail: t?.email ?? null, kind: e.kind };
  }

  /** Üyelik açılır (ya da var olan hesaba eklenir); kadro kartına doğrulanan e-posta yazılır */
  async function complete(e: typeof enrollments.$inferSelect, approverId: string | null, role?: EnrollRole) {
    const [t] = e.teacherId ? await db.select().from(teachers).where(eq(teachers.id, e.teacherId)) : [];
    if (!t) throw badRequest('Öğretmen kaydı silinmiş.');
    if ((await linkedTeacherIds(e.schoolId)).has(t.id)) throw conflict(`${t.fullName} için bu okulda zaten bir hesap var.`);
    const m = role ? roleToMembership(role) : { role: e.role, permissions: e.permissions };
    return db.transaction(async (tx) => {
      let userId = e.existingUserId;
      if (!userId) {
        const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, e.email!));
        if (taken) throw conflict('Bu e-posta başka bir hesapta kullanılıyor. Öğretmen o hesabın şifresiyle yeniden denemeli.');
        const [u] = await tx.insert(users).values({ email: e.email!, fullName: t.fullName, passwordHash: e.passwordHash! }).returning({ id: users.id });
        userId = u!.id;
      }
      const [already] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.schoolId, e.schoolId)));
      if (already) await tx.update(memberships).set({ teacherId: t.id }).where(eq(memberships.id, already.id));
      else await tx.insert(memberships).values({ userId, schoolId: e.schoolId, role: m.role, permissions: m.permissions, teacherId: t.id });
      await tx.update(teachers).set({ email: e.email }).where(eq(teachers.id, t.id));
      await tx
        .update(enrollments)
        .set({ status: 'done', stepHash: null, codeHash: null, passwordHash: null, emailCodeHash: null, updatedAt: new Date(), createdBy: e.createdBy ?? approverId })
        .where(eq(enrollments.id, e.id));
      return { userId, fullName: t.fullName };
    });
  }

  /* ---------- Yetkili (Kullanıcılar → Kadro) ---------- */

  /** Bekleyen kodlar ve onay bekleyen toplantı katılımları */
  app.get(base, manage, async (req) => {
    const rows = await db
      .select({
        id: enrollments.id,
        teacherId: enrollments.teacherId,
        kind: enrollments.kind,
        role: enrollments.role,
        permissions: enrollments.permissions,
        email: enrollments.email,
        status: enrollments.status,
        codeExpiresAt: enrollments.codeExpiresAt,
        stepExpiresAt: enrollments.stepExpiresAt,
        updatedAt: enrollments.updatedAt,
      })
      .from(enrollments)
      .where(and(eq(enrollments.schoolId, req.ctx.schoolId), inArray(enrollments.status, ['waiting', 'pending'])))
      .orderBy(desc(enrollments.updatedAt));
    const now = Date.now();
    return {
      mail: mailConfigured(env),
      items: rows
        // Süresi dolmuş kodlar listede görünmez
        .filter((r) => r.status === 'pending' || (r.codeExpiresAt && r.codeExpiresAt.getTime() > now) || (r.stepExpiresAt && r.stepExpiresAt.getTime() > now))
        .map(({ permissions, ...r }) => ({ ...r, role: membershipToRole(r.role, permissions) })),
    };
  });

  /** A · Kişi başı tek kullanımlık giriş kodu (15 dk). Aynı öğretmenin eski kodu geçersiz olur. */
  app.post(`${base}/code`, manage, async (req) => {
    const body = parse(enrollCodeCreateSchema, req.body);
    if (body.role === 'admin' && req.ctx.role !== 'owner') throw forbidden('Yönetici hesabını yalnızca okul müdürü açabilir.');
    const [t] = await db.select().from(teachers).where(and(eq(teachers.id, body.teacherId), eq(teachers.schoolId, req.ctx.schoolId)));
    if (!t) throw notFound('Öğretmen bulunamadı.');
    if ((await linkedTeacherIds(req.ctx.schoolId)).has(t.id)) throw conflict(`${t.fullName} için zaten bir hesap var.`);
    await db
      .update(enrollments)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(enrollments.schoolId, req.ctx.schoolId), eq(enrollments.teacherId, t.id), eq(enrollments.status, 'waiting')));
    const code = pairingCode(8);
    const m = roleToMembership(body.role);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await db.insert(enrollments).values({
      schoolId: req.ctx.schoolId,
      teacherId: t.id,
      kind: 'code',
      role: m.role,
      permissions: m.permissions,
      codeHash: sha256(code),
      codeExpiresAt: expiresAt,
      createdBy: req.ctx.userId,
    });
    await audit(req, 'create', 'Giriş kodu', t.id, `${t.fullName} için giriş kodu verildi`);
    return { code, url: `${appUrl()}?kod=${code}`, expiresAt: expiresAt.toISOString(), fullName: t.fullName };
  });

  /** B · Toplantı QR'ı (1 saat). Öğretmen kadrodan adını seçer; hesap yetkili onaylayınca açılır. */
  app.post(`${base}/meeting`, manage, async (req) => {
    const token = randomToken('jl', 18);
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);
    await db.insert(joinLinks).values({ schoolId: req.ctx.schoolId, tokenHash: sha256(token), expiresAt, createdBy: req.ctx.userId });
    await audit(req, 'create', 'Toplantı QR', null, 'Öğretmen hesap açma bağlantısı oluşturuldu (1 saat)');
    return { url: `${appUrl()}?okul=${token}`, expiresAt: expiresAt.toISOString() };
  });

  /** Toplantı bağlantısını süresinden önce kapatır */
  app.delete(`${base}/meeting`, manage, async (req, reply) => {
    await db.update(joinLinks).set({ expiresAt: new Date() }).where(and(eq(joinLinks.schoolId, req.ctx.schoolId), gt(joinLinks.expiresAt, new Date())));
    return reply.status(204).send();
  });

  async function loadPending(req: FastifyRequest) {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const [e] = await db.select().from(enrollments).where(and(eq(enrollments.id, id), eq(enrollments.schoolId, req.ctx.schoolId)));
    if (!e) throw notFound('Katılım isteği bulunamadı.');
    return e;
  }

  app.post(`${base}/:id/approve`, manage, async (req) => {
    const e = await loadPending(req);
    if (e.status !== 'pending') throw badRequest('Bu istek onay beklemiyor.');
    const body = parse(enrollApproveSchema, req.body ?? {});
    const role = body.role ?? membershipToRole(e.role, e.permissions);
    if (role === 'admin' && req.ctx.role !== 'owner') throw forbidden('Yönetici hesabını yalnızca okul müdürü açabilir; başka bir rol seçin.');
    const done = await complete(e, req.ctx.userId, role);
    await audit(req, 'create', 'Kullanıcı', done.userId, `${done.fullName} (${e.email}) toplantı QR'ı ile katıldı, onaylandı`);
    await tell(app.deps, [done.userId], { kind: 'enroll', title: 'Hesabınız onaylandı', body: `${req.ctx.school.name} · artık giriş yapabilirsiniz`, to: '/', schoolId: req.ctx.schoolId });
    if (e.email) {
      await trySendMail(env, {
        to: e.email,
        subject: `${req.ctx.school.name} · Okulyayın hesabınız onaylandı`,
        text: `Merhaba ${done.fullName},\n\n${req.ctx.school.name} Okulyayın hesabınız onaylandı. E-postanız ve belirlediğiniz şifreyle mobil uygulamaya ya da ${env.PUBLIC_URL.replace(/\/$/, '')}/app/ adresine giriş yapabilirsiniz.\n`,
      });
    }
    return { ok: true };
  });

  app.post(`${base}/:id/cancel`, manage, async (req) => {
    const e = await loadPending(req);
    await db.update(enrollments).set({ status: 'cancelled', stepHash: null, codeHash: null, passwordHash: null, updatedAt: new Date() }).where(eq(enrollments.id, e.id));
    return { ok: true };
  });

  /* ---------- Öğretmen (giriş yapmadan) ---------- */

  /** A · Kodla başla: kod bir kez kullanılır */
  app.post('/api/enroll/code', publicLimit, async (req) => {
    const { code } = parse(enrollStartCodeSchema, req.body);
    const [e] = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.codeHash, sha256(code.toUpperCase().replace(/[^A-Z0-9]/g, ''))), gt(enrollments.codeExpiresAt, new Date()), eq(enrollments.status, 'waiting')));
    if (!e) throw unauthorized('Kod hatalı ya da süresi dolmuş. Yetkiliden yeni kod isteyin.');
    await db.update(enrollments).set({ codeHash: null }).where(eq(enrollments.id, e.id));
    return { token: await newStep(e.id), ...(await intro(e)) };
  });

  async function linkSchool(link: string) {
    const [l] = await db.select().from(joinLinks).where(and(eq(joinLinks.tokenHash, sha256(link)), gt(joinLinks.expiresAt, new Date())));
    if (!l) throw unauthorized('QR kodunun süresi dolmuş. Yetkiliden yenisini isteyin.');
    return l.schoolId;
  }

  /** B · Toplantı QR'ı: hesabı olmayan aktif öğretmenler listelenir (yalnızca ad ve branş) */
  app.post('/api/enroll/meeting', publicLimit, async (req) => {
    const { link } = parse(enrollMeetingSchema, req.body);
    const schoolId = await linkSchool(link);
    const [s] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, schoolId));
    const linked = await linkedTeacherIds(schoolId);
    const pending = await db
      .select({ teacherId: enrollments.teacherId })
      .from(enrollments)
      .where(and(eq(enrollments.schoolId, schoolId), eq(enrollments.status, 'pending')));
    const busy = new Set(pending.map((p) => p.teacherId));
    const rows = await db
      .select({ id: teachers.id, fullName: teachers.fullName, branch: teacherBranches.name, title: teacherTitles.name })
      .from(teachers)
      .leftJoin(teacherBranches, eq(teacherBranches.id, teachers.branchId))
      .leftJoin(teacherTitles, eq(teacherTitles.id, teachers.titleId))
      .where(and(eq(teachers.schoolId, schoolId), eq(teachers.isActive, true)));
    return {
      schoolName: s?.name ?? '',
      teachers: rows.filter((t) => !linked.has(t.id) && !busy.has(t.id)).sort((a, b) => trCompare(a.fullName, b.fullName)),
    };
  });

  app.post('/api/enroll/meeting/start', publicLimit, async (req) => {
    const body = parse(enrollMeetingStartSchema, req.body);
    const schoolId = await linkSchool(body.link);
    const [t] = await db.select().from(teachers).where(and(eq(teachers.id, body.teacherId), eq(teachers.schoolId, schoolId), eq(teachers.isActive, true)));
    if (!t) throw notFound('Öğretmen bulunamadı.');
    if ((await linkedTeacherIds(schoolId)).has(t.id)) throw conflict('Bu öğretmenin zaten hesabı var. Giriş ekranından e-postanızla girin.');
    const m = roleToMembership(await suggestedRole(schoolId, t.titleId));
    const [e] = await db.insert(enrollments).values({ schoolId, teacherId: t.id, kind: 'meeting', role: m.role, permissions: m.permissions }).returning();
    return { token: await newStep(e!.id), ...(await intro(e!)) };
  });

  /**
   * E-posta adımı. E-posta başka bir hesapta kayıtlıysa (ör. başka okulda) o hesabın şifresi istenir; yoksa
   * e-posta ayarlıysa 6 haneli doğrulama kodu gönderilir. E-posta gönderimi ayarlı değilse doğrulamasız kabul edilir.
   */
  app.post('/api/enroll/email', publicLimit, async (req) => {
    const body = parse(enrollEmailSchema, req.body);
    const e = await byStep(body.token);
    const email = body.email.toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing) {
      const [member] = await db
        .select({ id: memberships.id, teacherId: memberships.teacherId })
        .from(memberships)
        .where(and(eq(memberships.userId, existing.id), eq(memberships.schoolId, e.schoolId), isNotNull(memberships.teacherId), ne(memberships.teacherId, e.teacherId!)));
      if (member) throw conflict('Bu e-posta okulda başka bir öğretmenin hesabında kayıtlı.');
      await db.update(enrollments).set({ email, emailCodeHash: null, updatedAt: new Date() }).where(eq(enrollments.id, e.id));
      return { existing: true, verify: false };
    }
    if (!mailConfigured(env)) {
      await db.update(enrollments).set({ email, emailCodeHash: null, updatedAt: new Date() }).where(eq(enrollments.id, e.id));
      return { existing: false, verify: false };
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db
      .update(enrollments)
      .set({ email, emailCodeHash: sha256(code), emailCodeExpiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS), emailCodeTries: 0, updatedAt: new Date() })
      .where(eq(enrollments.id, e.id));
    const sent = await trySendMail(env, {
      to: email,
      subject: `Okulyayın doğrulama kodunuz: ${code}`,
      text: `Merhaba,\n\nOkulyayın hesabınızı açmak için doğrulama kodunuz: ${code}\n\nKod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayın.\n`,
    });
    if (!sent) throw badRequest('Doğrulama kodu gönderilemedi. E-posta adresini kontrol edip yeniden deneyin.');
    return { existing: false, verify: true };
  });

  /** Son adım: kod (varsa) ve şifre. Kodla açılan hesap hemen açılır; toplantı QR'ıyla açılan onaya düşer. */
  app.post('/api/enroll/finish', publicLimit, async (req) => {
    const body = parse(enrollFinishSchema, req.body);
    const e = await byStep(body.token);
    if (!e.email) throw badRequest('Önce e-postanızı girin.');
    let existingUserId: string | null = null;
    let passwordHash: string | null = null;

    const [existing] = await db.select().from(users).where(eq(users.email, e.email));
    if (existing) {
      if (!body.existingPassword || !(await verifyPassword(body.existingPassword, existing.passwordHash))) {
        if (!body.existingPassword) await burnPasswordCheck('x');
        throw unauthorized('Bu e-postayla kayıtlı hesabın şifresi hatalı.');
      }
      existingUserId = existing.id;
    } else {
      if (e.emailCodeHash) {
        if (e.emailCodeTries >= MAX_EMAIL_TRIES) throw unauthorized('Çok fazla hatalı deneme. E-postanızı yeniden girip yeni kod isteyin.');
        if (!e.emailCodeExpiresAt || e.emailCodeExpiresAt.getTime() < Date.now()) throw unauthorized('Doğrulama kodunun süresi doldu. Yeni kod isteyin.');
        if (!body.emailCode || sha256(body.emailCode.trim()) !== e.emailCodeHash) {
          await db.update(enrollments).set({ emailCodeTries: e.emailCodeTries + 1 }).where(eq(enrollments.id, e.id));
          throw unauthorized('Doğrulama kodu hatalı.');
        }
      }
      if (!body.password) throw badRequest('Şifre belirleyin.');
      passwordHash = await hashPassword(body.password);
    }

    if (e.kind === 'meeting') {
      await db
        .update(enrollments)
        .set({ status: 'pending', existingUserId, passwordHash, stepHash: null, emailCodeHash: null, updatedAt: new Date() })
        .where(eq(enrollments.id, e.id));
      const info = await intro(e);
      const managers = (await db.select({ userId: memberships.userId, role: memberships.role }).from(memberships).where(eq(memberships.schoolId, e.schoolId)))
        .filter((m) => m.role === 'owner' || m.role === 'admin')
        .map((m) => m.userId);
      await tell(app.deps, managers, {
        kind: 'enroll',
        title: 'Hesap onayı bekleniyor',
        body: `${info.fullName} (${e.email}) toplantı QR'ı ile hesap açtı`,
        to: '/kullanicilar?sekme=kadro',
        schoolId: e.schoolId,
      });
      return { status: 'pending', email: e.email };
    }
    await complete({ ...e, existingUserId, passwordHash }, null);
    return { status: 'done', email: e.email };
  });
}
