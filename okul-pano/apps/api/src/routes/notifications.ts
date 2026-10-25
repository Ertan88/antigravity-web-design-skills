import { zonedParts } from '@okulpano/shared';
import { and, desc, eq, gte, lte, or, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schoolGuard } from '../context.ts';
import { achievements, announcements, users } from '../db/schema.ts';

export interface PanelNotification {
  /** Okundu bilgisi için kalıcı anahtar */
  key: string;
  kind: 'approval' | 'returned' | 'approved' | 'month-student';
  title: string;
  body: string;
  at: string;
  /** Tıklayınca açılacak panel adresi */
  to: string;
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/**
 * Panelin sağ üstündeki bildirimler: kayıt tutulmaz, o anki duruma göre hesaplanır.
 * Onay yetkisi olanlara bekleyen duyurular; duyuruyu girene düzeltme istekleri ve onaylar;
 * okul hayatı yetkisi olana ay başında "ayın öğrencisi girilmedi" hatırlatması.
 */
export async function notificationRoutes(app: FastifyInstance) {
  const { db } = app.deps;

  app.get('/api/schools/:schoolId/notifications', { preHandler: [app.authenticate, schoolGuard()] }, async (req) => {
    const { schoolId, userId, permissions, school } = req.ctx;
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
  });
}
