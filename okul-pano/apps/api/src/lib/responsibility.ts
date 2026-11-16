import { normalizeName, responsibleFor, type Permission, type ResponsibilityArea, type SchoolSettings } from '@okulpano/shared';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { dutySupervisors, memberships, teachers, users } from '../db/schema.ts';
import { usersWithPermission } from './push.ts';

/**
 * Görev dağılımı (Okul Ayarları): bir işin bildirimini ve onayını alacak kişiler. Seçilen yöneticiler yetkililerle
 * kesişir; seçim yoksa ya da seçilenler artık yetkili değilse yetkisi olan herkese gider.
 */
export async function responsibleUsers(deps: AppDeps, schoolId: string, settings: Partial<SchoolSettings> | null | undefined, area: ResponsibilityArea, permission: Permission): Promise<string[]> {
  const eligible = await usersWithPermission(deps, schoolId, permission);
  return responsibleFor(settings?.responsibilities?.[area], eligible);
}

/** Kişi bu işin sorumlusu mu (bildirim kutusunda türetilen bildirimler için) */
export async function isResponsible(deps: AppDeps, schoolId: string, settings: Partial<SchoolSettings> | null | undefined, area: ResponsibilityArea, permission: Permission, userId: string): Promise<boolean> {
  const chosen = settings?.responsibilities?.[area] ?? [];
  if (!chosen.length) return true;
  return (await responsibleUsers(deps, schoolId, settings, area, permission)).includes(userId);
}

/**
 * Ders görevlendirme: o günün nöbetçi müdür yardımcısı. Nöbet çizelgesinde ad olarak tutulur; kadrodaki öğretmenle ya
 * da hesap adıyla eşleşen kullanıcılar döner. Eşleşme yoksa boş liste (çağıran yetkililere düşer).
 */
export async function supervisorUsers(deps: AppDeps, schoolId: string, date: string): Promise<string[]> {
  const [sup] = await deps.db.select({ name: dutySupervisors.name }).from(dutySupervisors).where(and(eq(dutySupervisors.schoolId, schoolId), eq(dutySupervisors.date, date)));
  if (!sup) return [];
  const key = normalizeName(sup.name);
  const staff = await deps.db.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers).where(eq(teachers.schoolId, schoolId));
  const teacherIds = new Set(staff.filter((t) => normalizeName(t.fullName) === key).map((t) => t.id));
  const members = await deps.db
    .select({ userId: memberships.userId, teacherId: memberships.teacherId, fullName: users.fullName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.schoolId, schoolId));
  return [...new Set(members.filter((m) => (m.teacherId && teacherIds.has(m.teacherId)) || normalizeName(m.fullName) === key).map((m) => m.userId))];
}

/** Bir tarih aralığındaki nöbetçi müdür yardımcılarının günleri (izin onaylanınca bildirim için) */
export async function supervisorDays(deps: AppDeps, schoolId: string, from: string, to: string): Promise<string[]> {
  const rows = await deps.db
    .select({ date: dutySupervisors.date })
    .from(dutySupervisors)
    .where(and(eq(dutySupervisors.schoolId, schoolId), gte(dutySupervisors.date, from), lte(dutySupervisors.date, to)));
  return rows.map((r) => r.date);
}

const trDay = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * İzin geçerli olunca (onay ya da yöneticinin girdiği izin) her gün için o günün nöbetçi müdür yardımcısına
 * "ders görevlendirme" bildirimi gider. Nöbetçi müdür yardımcısı girilmemiş ya da hesabı yoksa izinleri yönetenlere düşer.
 * Yalnızca bugünden itibaren 14 gün içindeki günler için gönderilir.
 */
export async function notifyCoverNeed(
  deps: AppDeps,
  schoolId: string,
  settings: Partial<SchoolSettings> | null | undefined,
  today: string,
  leave: { teacherName: string; startDate: string; endDate: string },
  tellFn: (ids: string[], n: { kind: string; title: string; body: string; to: string; schoolId: string }) => Promise<void>,
) {
  const from = leave.startDate > today ? leave.startDate : today;
  const last = addDays(today, 14);
  const to = leave.endDate < last ? leave.endDate : last;
  if (from > to) return;
  const fallback = await responsibleUsers(deps, schoolId, settings, 'leaves', 'leaves.manage');
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const sup = await supervisorUsers(deps, schoolId, d);
    await tellFn(sup.length ? sup : fallback, {
      kind: 'cover-needed',
      title: 'Ders görevlendirme',
      body: `${leave.teacherName} ${trDay(d)} izinli. Boş kalan dersi varsa görevlendirin.`,
      to: `/gorevlendirme?tarih=${d}`,
      schoolId,
    });
  }
}
