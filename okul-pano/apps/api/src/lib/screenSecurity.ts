import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, lt, or, isNull } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { revokedScreenTokens, screens } from '../db/schema.ts';
import { addToInbox } from '../routes/notifications.ts';
import { notifyUsers, usersWithPermission } from './push.ts';

/*
 * Pano güvenliği: pano içeriği yalnızca eşleştirilmiş cihazın anahtarıyla gelir. Ek önlemler:
 * - Yeni bir pano eşleşince ekranları yönetenlere bildirim (eşleştirmeyi onlar yapmadıysa hemen silebilirler).
 * - Aynı anahtar kısa süre içinde başka bir internet adresinden kullanılırsa uyarı (anahtar kopyalanmış olabilir).
 * - Uzun süre hiç bağlanmayan panonun anahtarı kendiliğinden iptal edilir (cihaz yeniden kurulmalı).
 * Süreler okula özgü değildir; bütün okullarda aynıdır.
 */

/** Bu kadar gün hiç bağlanmayan panonun anahtarı iptal edilir */
export const SCREEN_KEY_IDLE_DAYS = 30;
/** Önceki bağlantıdan bu kadar kısa süre sonra başka adresten gelen istek "aynı anda iki yerde" sayılır */
const CONCURRENT_MS = 3 * 60_000;
/** Aynı pano için "başka yerden açıldı" uyarısı en çok günde bir */
const ALERT_EVERY_MS = 24 * 3600_000;

export async function tellScreenAdmins(deps: AppDeps, schoolId: string, n: { title: string; body: string; push: string }) {
  const userIds = await usersWithPermission(deps, schoolId, 'screens.manage');
  if (!userIds.length) return;
  await addToInbox(deps.db, userIds, { key: `screen-security:${randomUUID()}`, kind: 'screen-security', title: n.title, body: n.body, to: '/ekranlar', schoolId });
  notifyUsers(deps, userIds, { title: n.title, body: n.push, url: '/panolar' });
}

/** Yeni cihaz panoya eşleşti (kalıcı anahtarını aldı) */
export async function noticeScreenPaired(deps: AppDeps, screen: { schoolId: string; name: string }) {
  await tellScreenAdmins(deps, screen.schoolId, {
    title: 'Yeni pano eşleşti',
    body: `"${screen.name}" panosuna bir cihaz bağlandı. Bu eşleştirmeyi siz ya da okulunuzdan biri yapmadıysa Panolar sayfasından panoyu silin ya da anahtarını yenileyin.`,
    push: `"${screen.name}" panosuna yeni bir cihaz bağlandı. Siz yapmadıysanız Panolar'dan kaldırın.`,
  });
}

/**
 * Pano isteği geldi: adresi kaydedilir. Önceki bağlantıdan kısa süre sonra başka bir adresten geldiyse anahtar iki
 * yerde kullanılıyor olabilir; ekranları yönetenler uyarılır (günde en çok bir kez).
 */
export async function noteScreenSeen(deps: AppDeps, screen: typeof screens.$inferSelect, ip: string | undefined, now = new Date()) {
  if (!ip || ip === screen.lastIp) return;
  const recent = screen.lastIp && screen.lastSeenAt && now.getTime() - screen.lastSeenAt.getTime() < CONCURRENT_MS;
  const alertDue = !screen.ipAlertAt || now.getTime() - screen.ipAlertAt.getTime() > ALERT_EVERY_MS;
  await deps.db
    .update(screens)
    .set({ lastIp: ip, ...(recent && alertDue ? { ipAlertAt: now } : {}) })
    .where(eq(screens.id, screen.id));
  if (recent && alertDue) {
    await tellScreenAdmins(deps, screen.schoolId, {
      title: 'Pano başka bir yerden açıldı',
      body: `"${screen.name}" panosunun anahtarı kısa süre içinde iki farklı internet adresinden kullanıldı. Pano yer değiştirmediyse ya da okulun internet bağlantısı değişmediyse anahtar kopyalanmış olabilir: Panolar sayfasından anahtarı yenileyin.`,
      push: `"${screen.name}" panosu başka bir yerden açıldı. Siz yapmadıysanız anahtarı yenileyin.`,
    });
  }
}

export type RevokeReason = 'rotated' | 'deleted' | 'idle';

/** Geçersiz kılınan anahtarın nedeni saklanır: pano eşleştirme ekranında nedenini gösterir */
export async function rememberRevoked(deps: AppDeps, screen: { schoolId: string; name: string; tokenHash: string | null }, reason: RevokeReason) {
  if (!screen.tokenHash) return;
  await deps.db
    .insert(revokedScreenTokens)
    .values({ tokenHash: screen.tokenHash, schoolId: screen.schoolId, screenName: screen.name, reason })
    .onConflictDoNothing();
}

/** Pano anahtarı geçersizse nedeni (kayıtlıysa) */
export async function revokedReason(deps: AppDeps, tokenHash: string) {
  const [r] = await deps.db.select().from(revokedScreenTokens).where(eq(revokedScreenTokens.tokenHash, tokenHash));
  return r ?? null;
}

/** Uzun süre bağlanmayan panoların anahtarını iptal eder (saatlik görev); iptal edilen pano sayısı */
export async function runScreenKeyExpiry(deps: AppDeps, now = new Date()) {
  const limit = new Date(now.getTime() - SCREEN_KEY_IDLE_DAYS * 86400_000);
  const idle = and(isNotNull(screens.tokenHash), or(lt(screens.lastSeenAt, limit), and(isNull(screens.lastSeenAt), lt(screens.createdAt, limit))));
  const before = await deps.db.select({ schoolId: screens.schoolId, name: screens.name, tokenHash: screens.tokenHash }).from(screens).where(idle);
  for (const s of before) await rememberRevoked(deps, s, 'idle');
  const expired = await deps.db.update(screens).set({ tokenHash: null }).where(idle).returning({ schoolId: screens.schoolId, name: screens.name });
  for (const s of expired) {
    await tellScreenAdmins(deps, s.schoolId, {
      title: 'Pano anahtarı iptal edildi',
      body: `"${s.name}" panosu ${SCREEN_KEY_IDLE_DAYS} gündür bağlanmadığı için anahtarı güvenlik amacıyla iptal edildi. Panoyu yeniden kullanmak için Panolar sayfasından anahtarı yenileyin ya da yeniden eşleştirin.`,
      push: `"${s.name}" panosu ${SCREEN_KEY_IDLE_DAYS} gündür bağlanmadı; anahtarı iptal edildi.`,
    });
  }
  return expired.length;
}
