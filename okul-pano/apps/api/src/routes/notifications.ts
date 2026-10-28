import { schoolFullName, zonedParts } from '@okulpano/shared';
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, notInArray, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessUser, schoolGuard, UUID_RE, type SchoolCtx } from '../context.ts';
import type { DB } from '../db/client.ts';
import { notFound, parse } from '../lib/errors.ts';
import { achievements, announcements, memberships, notifications, schools, teacherLeaves, teachers, users } from '../db/schema.ts';
import { dutyDay, dutyGaps } from '../lib/dayinfo.ts';
import { upcomingHolidays } from './holidays.ts';

export interface PanelNotification {
  /** Okundu bilgisi için kalıcı anahtar */
  key: string;
  kind: 'approval' | 'returned' | 'approved' | 'month-student' | 'leave-request' | 'duty-gap' | 'support-access' | 'support-revoked' | 'support-expired' | 'bridge-day';
  title: string;
  body: string;
  at: string;
  /** Tıklayınca açılacak panel adresi */
  to: string;
  /** Tıklayınca önce bu okula geçilir (platform bildirimleri) */
  schoolId?: string;
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
/** "2026-10-30" -> "30 Ekim Cuma" */
const dateText = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${DAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]}`;

/** "29 Ekim 12:30" */
export const untilText = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone }).format(d);

/**
 * Panelin sağ üstündeki bildirimler. Durumdan hesaplananlar her yoklamada bildirim kutusuna (notifications) yazılır;
 * okunanlar da Bildirimler sayfasında geçmiş olarak kalır.
 * Onay yetkisi olanlara bekleyen duyurular; duyuruyu girene düzeltme istekleri ve onaylar;
 * okul hayatı yetkisi olana ay başında "ayın öğrencisi girilmedi" hatırlatması.
 */
export async function notificationRoutes(app: FastifyInstance) {
  const { db } = app.deps;

  /** Okulun o anki durumundan hesaplanan bildirimler (kullanıcının yetkilerine göre) */
  const schoolNotifications = async (ctx: SchoolCtx): Promise<PanelNotification[]> => {
    const { schoolId, userId, permissions, school } = ctx;
    const out: PanelNotification[] = [];
    const weekAgo = new Date(Date.now() - 7 * 86400_000);

    if (permissions.includes('announcements.approve')) {
      const pending = await db
        .select({ id: announcements.id, title: announcements.title, updatedAt: announcements.updatedAt, by: users.fullName })
        .from(announcements)
        .leftJoin(users, eq(users.id, announcements.createdBy))
        .where(and(eq(announcements.schoolId, schoolId), eq(announcements.approvalStatus, 'pending')))
        .orderBy(desc(announcements.updatedAt))
        .limit(30);
      for (const a of pending) {
        out.push({
          key: `approval:${a.id}:${a.updatedAt.getTime()}`,
          kind: 'approval',
          title: 'Onay bekleyen duyuru',
          body: `${a.by ?? 'Bir kullanıcı'} “${a.title}” duyurusunu onaya gönderdi.`,
          at: a.updatedAt.toISOString(),
          to: `/duyurular?incele=${a.id}`,
        });
      }
    }

    const mine = await db
      .select({ id: announcements.id, title: announcements.title, status: announcements.approvalStatus, note: announcements.reviewNote, reviewedAt: announcements.reviewedAt })
      .from(announcements)
      .where(
        and(
          eq(announcements.schoolId, schoolId),
          eq(announcements.createdBy, userId),
          or(eq(announcements.approvalStatus, 'rejected'), and(eq(announcements.approvalStatus, 'approved'), gte(announcements.reviewedAt, weekAgo))),
        ),
      )
      .orderBy(desc(announcements.reviewedAt))
      .limit(30);
    for (const a of mine) {
      if (!a.reviewedAt) continue;
      out.push(
        a.status === 'rejected'
          ? {
              key: `returned:${a.id}:${a.reviewedAt.getTime()}`,
              kind: 'returned',
              title: 'Düzeltme istendi',
              body: `“${a.title}”: ${a.note ?? ''}`,
              at: a.reviewedAt.toISOString(),
              to: `/duyurular?duzenle=${a.id}`,
            }
          : {
              key: `approved:${a.id}:${a.reviewedAt.getTime()}`,
              kind: 'approved',
              title: 'Duyurunuz onaylandı',
              body: `“${a.title}” panolarda yayında.`,
              at: a.reviewedAt.toISOString(),
              to: '/duyurular',
            },
      );
    }

    // Öğretmenlerin mobil uygulamadan bildirdiği izinler
    if (permissions.includes('leaves.manage')) {
      const pendingLeaves = await db
        .select({ id: teacherLeaves.id, startDate: teacherLeaves.startDate, endDate: teacherLeaves.endDate, createdAt: teacherLeaves.createdAt, name: teachers.fullName })
        .from(teacherLeaves)
        .innerJoin(teachers, eq(teachers.id, teacherLeaves.teacherId))
        .where(and(eq(teacherLeaves.schoolId, schoolId), eq(teacherLeaves.approvalStatus, 'pending')))
        .orderBy(desc(teacherLeaves.createdAt))
        .limit(30);
      for (const l of pendingLeaves) {
        out.push({
          key: `leave-request:${l.id}`,
          kind: 'leave-request',
          title: 'İzin bildirimi',
          body: `${l.name} ${l.startDate === l.endDate ? l.startDate : `${l.startDate} – ${l.endDate}`} için izin bildirdi.`,
          at: l.createdAt.toISOString(),
          to: '/izinler',
        });
      }
    }

    // Bugün boş kalan nöbet yerleri (öğretmen izinli, yerine kimse yok)
    if (permissions.includes('duties.manage')) {
      const today = zonedParts(new Date(), school.timezone).isoDate;
      const gaps = dutyGaps(await dutyDay(db, schoolId, today));
      if (gaps.length) {
        out.push({
          key: `duty-gap:${today}:${gaps.map((g) => g.dutyId).join(',')}`,
          kind: 'duty-gap',
          title: 'Boş nöbet yeri',
          body: `${gaps.map((g) => `${g.area} (${g.teacherName} izinli)`).join(', ')}: yerine görevlendirme yapın.`,
          at: new Date(`${today}T05:00:00Z`).toISOString(),
          to: '/nobet',
        });
      }
    }

    // Önümüzdeki 3 hafta: bayrama bitişik olası köprü günleri (idari izin ilan edilirse Zil Saatleri › Tatiller'den işaretlenir)
    if (permissions.includes('duties.manage') && permissions.includes('schedule.manage')) {
      const today = zonedParts(new Date(), school.timezone).isoDate;
      const { bridges } = await upcomingHolidays(db, schoolId, today, 21);
      for (const b of bridges) {
        out.push({
          key: `bridge-day:${b.date}`,
          kind: 'bridge-day',
          title: 'Olası köprü günü',
          body: `${dateText(b.date)}, ${b.near} tatiline bitişik. İdari izin ilan edilirse tatil olarak işaretleyin; pano o gün zil çalmaz.`,
          at: new Date(`${today}T06:00:00Z`).toISOString(),
          to: '/zil-saatleri?tatiller=1',
        });
      }
    }

    // Ayın ilk 10 günü: bu ayın öğrencisi girilmemişse hatırlat
    if (permissions.includes('highlights.manage')) {
      const today = zonedParts(new Date(), school.timezone);
      if (today.day <= 10) {
        const now = new Date();
        const [found] = await db
          .select({ id: achievements.id })
          .from(achievements)
          .where(
            and(
              eq(achievements.schoolId, schoolId),
              eq(achievements.kind, 'month'),
              eq(achievements.isActive, true),
              or(isNull(achievements.startsAt), lte(achievements.startsAt, now)),
              or(isNull(achievements.endsAt), gte(achievements.endsAt, now)),
            ),
          )
          .limit(1);
        if (!found) {
          out.push({
            key: `month-student:${today.isoDate.slice(0, 7)}`,
            kind: 'month-student',
            title: 'Ayın öğrencisi girilmedi',
            body: `${MONTHS[today.month - 1]} ayının öğrencisini ekleyin; kaydettiğiniz anda panoda yayına girer.`,
            at: new Date(`${today.isoDate.slice(0, 8)}01T08:00:00Z`).toISOString(),
            to: '/basarilar?yeni=ay',
          });
        }
      }
    }

    return out.sort((a, b) => b.at.localeCompare(a.at));
  };

  /**
   * Platform yöneticisine: süresi dolan destek erişimleri (verildi / kapatıldı bildirimleri olay anında yazılır).
   * Üyesi olduğu okullar hariç.
   */
  const platformNotifications = async (userId: string): Promise<PanelNotification[]> => {
    const own = new Set((await db.select({ id: memberships.schoolId }).from(memberships).where(eq(memberships.userId, userId))).map((r) => r.id));
    const now = new Date();
    const rows = await db
      .select()
      .from(schools)
      .where(and(lte(schools.supportAccessUntil, now), gt(schools.supportAccessUntil, new Date(now.getTime() - 30 * 86400_000))));
    return rows
      .filter((s) => !own.has(s.id))
      .map((s) => ({
        key: `support-expired:${s.id}:${s.supportAccessUntil!.getTime()}`,
        kind: 'support-expired' as const,
        title: 'Destek erişiminin süresi doldu',
        body: `${schoolFullName(s.name, s.settings?.schoolType)} için verilen erişim sona erdi; okulun verilerine artık giremezsiniz.`,
        at: s.supportAccessUntil!.toISOString(),
        to: '/platform',
      }));
  };

  /**
   * Hesaplanan bildirimleri kutuya yazar (aynı anahtar bir kez). Artık geçerli olmayan "iş" bildirimleri
   * (duyuru onaylandı, nöbet dolduruldu…) çözüldü ve okundu sayılır; kutuda geçmiş olarak kalır.
   */
  const sync = async (userId: string, schoolId: string | null, list: PanelNotification[], resolvable: readonly string[]) => {
    if (list.length) {
      await db
        .insert(notifications)
        .values(list.map((n) => ({ userId, schoolId, key: n.key, kind: n.kind, title: n.title, body: n.body, link: n.to, openSchoolId: n.schoolId ?? null, createdAt: new Date(n.at) })))
        .onConflictDoNothing();
    }
    const now = new Date();
    await db
      .update(notifications)
      .set({ resolvedAt: now, readAt: sql`coalesce(${notifications.readAt}, ${now})` })
      .where(
        and(
          eq(notifications.userId, userId),
          schoolId ? eq(notifications.schoolId, schoolId) : isNull(notifications.schoolId),
          isNull(notifications.resolvedAt),
          inArray(notifications.kind, [...resolvable]),
          list.length ? notInArray(notifications.key, list.map((n) => n.key)) : undefined,
        ),
      );
  };

  /** Kutudaki bildirimler: okulunki ve platformunkiler; okunmamış / okunmuş süzgeci, tarihe göre sayfalama */
  const listInbox = async (userId: string, schoolId: string | null, query: unknown) => {
    const q = parse(
      z.object({ filter: z.enum(['all', 'unread', 'read']).default('all'), before: z.iso.datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }),
      query ?? {},
    );
    // Seyrek temizlik: 180 günden eski bildirimler
    await db.delete(notifications).where(and(eq(notifications.userId, userId), lt(notifications.createdAt, new Date(Date.now() - 180 * 86400_000))));
    const scope = and(eq(notifications.userId, userId), schoolId ? or(eq(notifications.schoolId, schoolId), isNull(notifications.schoolId)) : isNull(notifications.schoolId));
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          scope,
          q.filter === 'unread' ? isNull(notifications.readAt) : q.filter === 'read' ? isNotNull(notifications.readAt) : undefined,
          q.before ? lt(notifications.createdAt, new Date(q.before)) : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(q.limit + 1);
    const [counts] = await db
      .select({ unread: sql<number>`count(*) filter (where ${notifications.readAt} is null)::int`, total: sql<number>`count(*)::int` })
      .from(notifications)
      .where(scope);
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((r) => ({
        id: r.id,
        key: r.key,
        kind: r.kind,
        title: r.title,
        body: r.body,
        at: r.createdAt.toISOString(),
        to: r.link,
        schoolId: r.openSchoolId ?? undefined,
        readAt: r.readAt?.toISOString() ?? null,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
      unread: counts?.unread ?? 0,
      total: counts?.total ?? 0,
      nextBefore: rows.length > q.limit ? page[page.length - 1]!.createdAt.toISOString() : null,
    };
  };

  // Mobil uygulama (eski sürümler dahil) o anki bildirimleri buradan alır; panel kutuyu kullanır
  app.get('/api/schools/:schoolId/notifications', { preHandler: [app.authenticate, schoolGuard()] }, async (req) => {
    const list = await schoolNotifications(req.ctx);
    if (!req.ctx.isSupport) await sync(req.ctx.userId, req.ctx.schoolId, list, RESOLVABLE);
    // Eski mobil sürümler yalnızca bu türleri tanır (bilinmeyen tür ekranı çökertir)
    return list.filter((n) => LEGACY_KINDS.includes(n.kind));
  });

  /** Okul seçiliyken bildirim kutusu: okulun bildirimleri + platform bildirimleri */
  app.get('/api/schools/:schoolId/inbox', { preHandler: [app.authenticate, schoolGuard()] }, async (req) => {
    const { userId, schoolId, isSuperAdmin, isSupport } = req.ctx;
    // KVKK: destek erişimindeki platform yöneticisinin kutusuna okulun bildirimleri (öğretmen adları vb.) yazılmaz
    if (!isSupport) await sync(userId, schoolId, await schoolNotifications(req.ctx), RESOLVABLE);
    if (isSuperAdmin) await sync(userId, null, await platformNotifications(userId), []);
    return listInbox(userId, isSupport ? null : schoolId, req.query);
  });

  /** Okul seçili değilken (platform yöneticisi): yalnızca platform bildirimleri */
  app.get('/api/me/inbox', { preHandler: app.authenticate }, async (req) => {
    const { sub, sa } = accessUser(req);
    if (sa) await sync(sub, null, await platformNotifications(sub), []);
    return listInbox(sub, null, req.query);
  });

  /** Okundu say: seçilenler, eski tarayıcıda okunanlar (anahtarla) ya da tümü (okul + platform) */
  app.post('/api/me/inbox/read', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub } = accessUser(req);
    const body = parse(
      z.object({ ids: z.array(z.uuid()).max(200).optional(), keys: z.array(z.string().max(200)).max(300).optional(), all: z.literal(true).optional(), schoolId: z.uuid().optional() }),
      req.body ?? {},
    );
    const target = body.all
      ? body.schoolId
        ? or(eq(notifications.schoolId, body.schoolId), isNull(notifications.schoolId))
        : undefined
      : body.ids?.length
        ? inArray(notifications.id, body.ids)
        : body.keys?.length
          ? inArray(notifications.key, body.keys)
          : sql`false`;
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, sub), isNull(notifications.readAt), target));
    return reply.status(204).send();
  });

  app.post('/api/me/inbox/:id/unread', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub } = accessUser(req);
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const [row] = await db.update(notifications).set({ readAt: null }).where(and(eq(notifications.id, id), eq(notifications.userId, sub))).returning({ id: notifications.id });
    if (!row) throw notFound();
    return reply.status(204).send();
  });

  app.delete('/api/me/inbox/:id', { preHandler: app.authenticate }, async (req, reply) => {
    const { sub } = accessUser(req);
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) throw notFound();
    const [row] = await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, sub))).returning({ id: notifications.id });
    if (!row) throw notFound();
    return reply.status(204).send();
  });
}

const LEGACY_KINDS: readonly string[] = ['approval', 'returned', 'approved', 'month-student', 'leave-request', 'duty-gap'];

/** Durum ortadan kalkınca kendiliğinden çözülen bildirimler ("Duyurunuz onaylandı" gibi bilgi bildirimleri kalır) */
const RESOLVABLE = ['approval', 'returned', 'leave-request', 'duty-gap', 'month-student', 'bridge-day'] as const;

/** Olay bildirimi: verilen kullanıcıların kutusuna yazılır (ör. destek erişimi verildi / kapatıldı) */
export async function addToInbox(
  db: DB,
  userIds: readonly string[],
  n: { key: string; kind: string; title: string; body: string; to?: string; schoolId?: string | null; openSchoolId?: string | null },
) {
  if (!userIds.length) return;
  await db
    .insert(notifications)
    .values(userIds.map((userId) => ({ userId, schoolId: n.schoolId ?? null, key: n.key, kind: n.kind, title: n.title, body: n.body, link: n.to ?? '/', openSchoolId: n.openSchoolId ?? null })))
    .onConflictDoNothing();
}
