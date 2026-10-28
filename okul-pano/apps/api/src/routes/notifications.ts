import { schoolFullName, zonedParts } from '@okulpano/shared';
import { and, desc, eq, gt, gte, lte, or, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { accessUser, schoolGuard } from '../context.ts';
import { achievements, announcements, memberships, schools, teacherLeaves, teachers, users } from '../db/schema.ts';
import { dutyDay, dutyGaps } from '../lib/dayinfo.ts';
import { upcomingHolidays } from './holidays.ts';

export interface PanelNotification {
  /** Okundu bilgisi için kalıcı anahtar */
  key: string;
  kind: 'approval' | 'returned' | 'approved' | 'month-student' | 'leave-request' | 'duty-gap' | 'support-access' | 'bridge-day';
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

const untilText = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone }).format(d);

/**
 * Panelin sağ üstündeki bildirimler: kayıt tutulmaz, o anki duruma göre hesaplanır.
 * Onay yetkisi olanlara bekleyen duyurular; duyuruyu girene düzeltme istekleri ve onaylar;
 * okul hayatı yetkisi olana ay başında "ayın öğrencisi girilmedi" hatırlatması.
 */
export async function notificationRoutes(app: FastifyInstance) {
  const { db } = app.deps;

  /**
   * Okuldan bağımsız bildirimler. Platform yöneticisine: süreli destek erişimi veren okullar (KVKK). Panel bu listeyi
   * sık yoklar; liste değişince okul listesini de yeniler, böylece sayfayı yenilemeden okula girilir.
   */
  app.get('/api/me/notifications', { preHandler: app.authenticate }, async (req) => {
    const { sub } = accessUser(req);
    const [user] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, sub));
    if (!user?.isSuperAdmin) return [];
    const own = new Set((await db.select({ id: memberships.schoolId }).from(memberships).where(eq(memberships.userId, sub))).map((r) => r.id));
    const rows = await db.select().from(schools).where(gt(schools.supportAccessUntil, new Date())).orderBy(desc(schools.supportAccessGrantedAt));
    return rows
      .filter((s) => !own.has(s.id))
      .map(
        (s): PanelNotification => ({
          key: `support-access:${s.id}:${s.supportAccessGrantedAt?.getTime() ?? s.supportAccessUntil!.getTime()}`,
          kind: 'support-access',
          title: 'Destek erişimi verildi',
          body: `${schoolFullName(s.name, s.settings?.schoolType)} verilerine ${untilText(s.supportAccessUntil!, s.timezone)} tarihine kadar erişebilirsiniz.`,
          at: (s.supportAccessGrantedAt ?? new Date()).toISOString(),
          to: '/',
          schoolId: s.id,
        }),
      );
  });

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
  });
}
