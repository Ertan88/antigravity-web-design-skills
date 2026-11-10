import { createMemberSchema, effectivePermissions, resetPasswordSchema, updateMemberSchema } from '@okulpano/shared';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { audit, schoolGuard, UUID_RE } from '../context.ts';
import { memberships, sessions, teachers, users } from '../db/schema.ts';
import { hashPassword, readablePassword } from '../lib/crypto.ts';
import { trySendMail } from '../lib/mailer.ts';
import { notifyUsers } from '../lib/push.ts';
import { addToInbox } from './notifications.ts';
import { createInvite } from './signup.ts';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors.ts';

/** Davetle eklenen ve henüz şifresini belirlemeyen hesap: bu değerle hiçbir şifre eşleşmez */
export const INVITE_PENDING = 'davet-bekliyor';

export async function memberRoutes(app: FastifyInstance) {
  const { db } = app.deps;
  const base = '/api/schools/:schoolId/members';
  const manage = { preHandler: [app.authenticate, schoolGuard('users.manage')] };

  /** Bağlanacak öğretmen bu okula ait olmalı */
  async function checkTeacher(req: FastifyRequest, teacherId: string | null | undefined) {
    if (!teacherId) return;
    const [t] = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(and(eq(teachers.id, teacherId), eq(teachers.schoolId, req.ctx.schoolId)));
    if (!t) throw badRequest('Seçilen öğretmen bu okula ait değil.');
  }

  async function loadMember(req: FastifyRequest) {
    const { memberId } = req.params as { memberId: string };
    if (!UUID_RE.test(memberId)) throw notFound();
    const [m] = await db
      .select({ membership: memberships, email: users.email, fullName: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.id, memberId), eq(memberships.schoolId, req.ctx.schoolId)));
    if (!m) throw notFound('Kullanıcı bulunamadı.');
    if (m.membership.role === 'owner') throw forbidden('Okul müdürünün yetkileri buradan değiştirilemez.');
    if (m.membership.userId === req.ctx.userId) throw forbidden('Kendi yetkilerinizi değiştiremezsiniz.');
    // Yönetici atama ve yöneticileri değiştirme okul müdüründe (müdür); yönetici editör ekler ve yetki verir
    if (m.membership.role === 'admin' && req.ctx.role !== 'owner') throw forbidden('Yöneticileri yalnızca okul müdürü değiştirebilir.');
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
        teacherId: memberships.teacherId,
        teacherName: teachers.fullName,
        lastLoginAt: users.lastLoginAt,
        passwordHash: users.passwordHash,
        promotionRequestedBy: memberships.promotionRequestedBy,
        promotionRequestedAt: memberships.promotionRequestedAt,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(teachers, eq(teachers.id, memberships.teacherId))
      .where(eq(memberships.schoolId, req.ctx.schoolId))
      .orderBy(asc(users.fullName));
    const requesterIds = [...new Set(rows.map((r) => r.promotionRequestedBy).filter((x): x is string => Boolean(x)))];
    const names = new Map(
      requesterIds.length ? (await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, requesterIds))).map((u) => [u.id, u.fullName]) : [],
    );
    return rows.map(({ passwordHash, promotionRequestedBy, promotionRequestedAt, ...r }) => ({
      ...r,
      invitePending: passwordHash === INVITE_PENDING,
      effectivePermissions: effectivePermissions(r.role, r.permissions),
      /** Bir yöneticinin "Yönetici yapılsın" önerisi (müdürün onayını bekler) */
      promotionRequest:
        r.role === 'editor' && promotionRequestedAt ? { byName: (promotionRequestedBy && names.get(promotionRequestedBy)) || 'Bir yönetici', at: promotionRequestedAt.toISOString() } : null,
    }));
  });

  /* ---------- Yönetici önerisi: yönetici önerir, müdür onaylar (Yönetici atamayı yalnızca müdür yapar) ---------- */

  app.post(`${base}/:memberId/promotion-request`, manage, async (req) => {
    if (req.ctx.role !== 'admin') throw forbidden(req.ctx.role === 'owner' ? 'Müdür olarak kişiyi doğrudan Yönetici yapabilirsiniz.' : 'Öneriyi yalnızca yöneticiler gönderebilir.');
    const m = await loadMember(req);
    if (m.membership.role !== 'editor') throw badRequest(`${m.fullName} zaten yönetici.`);
    if (m.membership.promotionRequestedAt) throw conflict(`${m.fullName} için öneri zaten gönderildi; müdürün onayını bekliyor.`);
    await db.update(memberships).set({ promotionRequestedBy: req.ctx.userId, promotionRequestedAt: new Date() }).where(eq(memberships.id, m.membership.id));
    await audit(req, 'update', 'Yönetici önerisi', m.membership.id, `${m.fullName} için Yönetici önerildi`);
    const [owner] = await db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.schoolId, req.ctx.schoolId), eq(memberships.role, 'owner')));
    const [me] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, req.ctx.userId));
    if (owner) {
      const title = 'Yönetici önerisi';
      const body = `${me?.fullName ?? 'Bir yönetici'}, ${m.fullName} kişisinin Yönetici yapılmasını öneriyor. Kişiler ve Yetkiler'den onaylayabilirsiniz.`;
      notifyUsers(app.deps, [owner.id], { title, body, url: '/kullanicilar' });
      await addToInbox(db, [owner.id], { key: `promotion:${m.membership.id}:${Date.now()}`, kind: 'approval', title, body, to: '/kullanicilar', schoolId: req.ctx.schoolId, openSchoolId: req.ctx.schoolId });
      await trySendMail(app.deps.env, { to: owner.email, subject: `${req.ctx.school.name} · ${title}`, text: `Merhaba ${owner.fullName},\n\n${body}\n` });
    }
    return { ok: true };
  });

  app.post(`${base}/:memberId/promotion-request/approve`, manage, async (req) => {
    if (req.ctx.role !== 'owner') throw forbidden('Öneriyi yalnızca okul müdürü onaylayabilir.');
    const m = await loadMember(req);
    if (m.membership.role !== 'editor') throw badRequest(`${m.fullName} zaten yönetici.`);
    await db.update(memberships).set({ role: 'admin', permissions: [], promotionRequestedBy: null, promotionRequestedAt: null }).where(eq(memberships.id, m.membership.id));
    await audit(req, 'update', 'Yönetici önerisi', m.membership.id, `${m.fullName} Yönetici yapıldı (öneri onaylandı)`);
    const title = 'Yönetici yapıldınız';
    const body = `${req.ctx.school.name} okulunda artık Yönetici olarak bütün bölümleri düzenleyebilirsiniz.`;
    notifyUsers(app.deps, [m.membership.userId], { title, body, url: '/' });
    await addToInbox(db, [m.membership.userId], { key: `promoted:${m.membership.id}:${Date.now()}`, kind: 'approved', title, body, schoolId: req.ctx.schoolId, openSchoolId: req.ctx.schoolId });
    return { ok: true };
  });

  /** Müdür reddeder ya da öneriyi gönderen yönetici geri çeker */
  app.delete(`${base}/:memberId/promotion-request`, manage, async (req, reply) => {
    if (req.ctx.role !== 'owner' && req.ctx.role !== 'admin') throw forbidden();
    const m = await loadMember(req);
    if (!m.membership.promotionRequestedAt) return reply.status(204).send();
    await db.update(memberships).set({ promotionRequestedBy: null, promotionRequestedAt: null }).where(eq(memberships.id, m.membership.id));
    await audit(req, 'update', 'Yönetici önerisi', m.membership.id, `${m.fullName} için Yönetici önerisi ${req.ctx.role === 'owner' ? 'reddedildi' : 'geri çekildi'}`);
    return reply.status(204).send();
  });

  const membershipCount = async (userId: string) =>
    (await db.select({ n: count() }).from(memberships).where(eq(memberships.userId, userId)))[0]!.n;

  app.post(base, manage, async (req, reply) => {
    const body = parse(createMemberSchema, req.body);
    if (body.role !== 'editor' && req.ctx.role !== 'owner') throw forbidden('Yönetici atamayı yalnızca okul müdürü yapabilir.');
    await checkTeacher(req, body.teacherId);
    const email = body.email.toLowerCase();
    let [user] = await db.select().from(users).where(eq(users.email, email));
    // Hiçbir okula bağlı olmayan eski hesap (ör. önceden silinmiş kullanıcı) yeni hesap gibi ele alınır:
    // yeni ad yazılır, davet ya da geçici şifre verilir. Başka okulda hesabı olan kişiye dokunulmaz.
    const orphan = Boolean(user && !user.isSuperAdmin && (await membershipCount(user.id)) === 0);
    const created = !user || orphan;
    // Davet yoksa ve şifre verilmediyse okunaklı geçici şifre üretilir (mobil uygulama) ve yanıtta bir kez döner
    const generated = created && !body.invite && !body.password ? readablePassword() : null;
    if (orphan) {
      [user] = await db
        .update(users)
        .set({ fullName: body.fullName, passwordHash: body.invite ? INVITE_PENDING : await hashPassword(body.password ?? generated!) })
        .where(eq(users.id, user!.id))
        .returning();
      await db.delete(sessions).where(eq(sessions.userId, user!.id));
    }
    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          email,
          fullName: body.fullName,
          // Davetle eklenen kişi şifresini bağlantıdan belirleyene kadar giriş yapamaz
          passwordHash: body.invite ? INVITE_PENDING : await hashPassword(body.password ?? generated!),
        })
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
        teacherId: body.teacherId ?? null,
      })
      .returning();
    await audit(req, 'create', 'Kullanıcı', m!.id, `${body.fullName} (${email})`);
    // Davet yalnızca yeni hesaplara gider; e-posta sistemde zaten kayıtlıysa kişi kendi şifresiyle girer
    const invite =
      body.invite && created
        ? await createInvite(app.deps, {
            userId: user!.id,
            schoolId: req.ctx.schoolId,
            school: req.ctx.school,
            membership: m!,
            email,
            fullName: body.fullName,
            createdBy: req.ctx.userId,
          })
        : null;
    // E-posta sistemde zaten kayıtlıysa girilen geçici şifre kullanılmaz: panel bunu açıkça söyler
    return reply.status(201).send({ id: m!.id, existingUser: !created, invite, ...(generated ? { password: generated } : {}) });
  });

  /** Daveti yeniden gönderir (kişi henüz şifresini belirlemediyse): eski bağlantı geçersiz olur */
  app.post(`${base}/:memberId/invite`, manage, async (req) => {
    const m = await loadMember(req);
    const [u] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, m.membership.userId));
    if (u?.passwordHash !== INVITE_PENDING) throw badRequest('Bu kullanıcı şifresini belirlemiş; gerekirse şifresini sıfırlayın.');
    const invite = await createInvite(app.deps, {
      userId: m.membership.userId,
      schoolId: req.ctx.schoolId,
      school: req.ctx.school,
      membership: m.membership,
      email: m.email,
      fullName: m.fullName,
      createdBy: req.ctx.userId,
    });
    await audit(req, 'update', 'Kullanıcı daveti', m.membership.id, `${m.fullName} için davet yenilendi`);
    return invite;
  });

  app.patch(`${base}/:memberId`, manage, async (req) => {
    const m = await loadMember(req);
    const body = parse(updateMemberSchema, req.body);
    if (body.role && body.role !== 'editor' && req.ctx.role !== 'owner') throw forbidden('Yönetici atamayı yalnızca okul müdürü yapabilir.');
    const role = body.role ?? m.membership.role;
    const permissions = role === 'editor' ? effectivePermissions('editor', body.permissions ?? m.membership.permissions) : [];
    await checkTeacher(req, body.teacherId);
    await db
      .update(memberships)
      .set({ role, permissions, ...(role === 'admin' ? { promotionRequestedBy: null, promotionRequestedAt: null } : {}), ...(body.teacherId !== undefined ? { teacherId: body.teacherId } : {}) })
      .where(eq(memberships.id, m.membership.id));
    await audit(req, 'update', 'Kullanıcı yetkisi', m.membership.id, m.fullName);
    return { ok: true };
  });

  /**
   * Kullanıcıyı öğretmen kaydıyla eşleştirir (mobilde kendi nöbetleri ve ders programı). Yetki değişikliği
   * olmadığı için okul müdürüne ve kişinin kendisine de uygulanabilir (ör. ders veren müdür yardımcısı).
   */
  app.put(`${base}/:memberId/teacher`, manage, async (req) => {
    const { memberId } = req.params as { memberId: string };
    if (!UUID_RE.test(memberId)) throw notFound();
    const { teacherId } = parse(z.object({ teacherId: z.uuid().nullable() }), req.body);
    await checkTeacher(req, teacherId);
    const [m] = await db
      .update(memberships)
      .set({ teacherId })
      .where(and(eq(memberships.id, memberId), eq(memberships.schoolId, req.ctx.schoolId)))
      .returning();
    if (!m) throw notFound('Kullanıcı bulunamadı.');
    await audit(req, 'update', 'Kullanıcı öğretmen eşleşmesi', m.id, teacherId ? 'eşleştirildi' : 'eşleşme kaldırıldı');
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
      emailed = await trySendMail(app.deps.env, {
        to: m.email,
        subject: `${req.ctx.school.name} · Okulyayın şifreniz`,
        text: `Merhaba ${m.fullName},\n\nOkulyayın yönetim paneli şifreniz yenilendi.\n\nAdres: ${url}\nE-posta: ${m.email}\nŞifre: ${password}\n\nGiriş yaptıktan sonra Hesabım sayfasından şifrenizi değiştirin.\n`,
      });
    }
    return { password, emailed, email: m.email, fullName: m.fullName };
  });

  app.delete(`${base}/:memberId`, manage, async (req, reply) => {
    const m = await loadMember(req);
    await db.delete(memberships).where(eq(memberships.id, m.membership.id));
    // Başka okulda hesabı yoksa kişinin hesabı da silinir (oturumlar, bildirimler, davetler birlikte gider):
    // aynı e-posta yeniden eklenince yeni ad ve yeni şifreyle açılır; gereksiz kişisel veri kalmaz (KVKK)
    const [u] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, m.membership.userId));
    if (u && !u.isSuperAdmin && (await membershipCount(m.membership.userId)) === 0) await db.delete(users).where(eq(users.id, m.membership.userId));
    await audit(req, 'delete', 'Kullanıcı', m.membership.id, m.fullName);
    return reply.status(204).send();
  });
}
