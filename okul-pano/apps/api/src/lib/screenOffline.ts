import { dayBells, zonedParts } from '@okulpano/shared';
import { and, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { schools, screens } from '../db/schema.ts';
import { loadExamContext } from './examSchedule.ts';
import { tellScreenAdmins } from './screenSecurity.ts';

/*
 * Pano bağlantısı koptu bildirimi. Son görülme veritabanında tutulur (pano her istekte ve açık bağlantıda dakikada
 * bir yazar); dakikalık iş, ders saatleri içinde 10 dakikadır görünmeyen panoyu ekranları yönetenlere (müdür, müdür
 * yardımcıları, "Panolar" görevi verilenler) bildirir. Sunucu uyuyup uyansa ya da yeniden başlasa da kaçmaz.
 * - Kesinti başına bir bildirim; pano geri gelince "yeniden bağlandı" bildirimi gider.
 * - Yalnızca okul günü, ilk dersten 15 dakika önceden son ders bitimine kadar (tatil, hafta sonu ve yarım gün
 *   zilden gelir): akşam TV'yi kapatan okula her gün bildirim gitmez.
 * Süreler okula özgü değildir; bütün okullarda aynıdır.
 */

/** Pano bu kadar süre görünmezse bildirim gider */
export const OFFLINE_ALERT_MS = 10 * 60_000;
/** İlk dersten bu kadar dakika önce panolar açık olmalı */
const BEFORE_FIRST_MIN = 15;
/** Okulun günlük ders saati penceresi önbellekte bu kadar kalır (zil değişirse en geç bu sürede yansır) */
const WINDOW_CACHE_MS = 10 * 60_000;
/** Sunucu yeni açıldıysa panoların yeniden bağlanması beklenir (uykudan uyanınca toplu yanlış bildirim olmasın) */
const STARTED_AT = Date.now();

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

type Window = { from: number; to: number } | null;
const windowCache = new Map<string, { at: number; window: Window }>();

/** Okulun bugünkü ders saati penceresi (dakika); tatilde ya da zil yoksa null */
async function schoolWindow(deps: Pick<AppDeps, 'db'>, school: typeof schools.$inferSelect, date: string, now: Date): Promise<Window> {
  const key = `${school.id}|${date}`;
  const hit = windowCache.get(key);
  if (hit && now.getTime() - hit.at < WINDOW_CACHE_MS) return hit.window;
  const { cal } = await loadExamContext(deps.db, school, date, date);
  const periods = dayBells(date, cal).flatMap((b) => b.periods);
  const window = periods.length
    ? { from: Math.min(...periods.map((p) => toMin(p.start))) - BEFORE_FIRST_MIN, to: Math.max(...periods.map((p) => toMin(p.end))) }
    : null;
  windowCache.set(key, { at: now.getTime(), window });
  return window;
}

/** Ders saatleri içinde bağlantısı kopan panoları bildirir; gönderilen bildirim sayısını döner */
export async function runScreenOfflineAlerts(deps: AppDeps, now = new Date(), opts: { startedAt?: number } = {}): Promise<number> {
  if (now.getTime() - (opts.startedAt ?? STARTED_AT) < OFFLINE_ALERT_MS) return 0;
  const { db } = deps;
  const stale = await db
    .select({ id: screens.id, schoolId: screens.schoolId, name: screens.name, lastSeenAt: screens.lastSeenAt })
    .from(screens)
    .where(and(isNotNull(screens.tokenHash), isNotNull(screens.lastSeenAt), lt(screens.lastSeenAt, new Date(now.getTime() - OFFLINE_ALERT_MS)), isNull(screens.offlineAlertAt)));
  // Açık bağlantısı olan pano (son görülme yazılamamış olsa bile) kopmuş sayılmaz
  const candidates = stale.filter((s) => !deps.bus.isOnline(s.id));
  if (!candidates.length) return 0;
  const schoolRows = await db.select().from(schools).where(inArray(schools.id, [...new Set(candidates.map((s) => s.schoolId))]));
  let sent = 0;
  for (const school of schoolRows) {
    const today = zonedParts(now, school.timezone);
    const window = await schoolWindow(deps, school, today.isoDate, now);
    const minute = today.hour * 60 + today.minute;
    if (!window || minute < window.from || minute > window.to) continue;
    for (const s of candidates.filter((c) => c.schoolId === school.id)) {
      // Birden çok sunucu ya da yeniden başlatma: bildirim bir kez
      const claimed = await db
        .update(screens)
        .set({ offlineAlertAt: now })
        .where(and(eq(screens.id, s.id), isNull(screens.offlineAlertAt)))
        .returning({ id: screens.id });
      if (!claimed.length) continue;
      const minutes = Math.round((now.getTime() - s.lastSeenAt!.getTime()) / 60_000);
      // Gece kapatılıp sabah açılmayan pano: "bugün henüz bağlanmadı"
      const since = zonedParts(s.lastSeenAt!, school.timezone).isoDate === today.isoDate ? `${minutes} dakikadır bağlı değil` : 'bugün henüz bağlanmadı';
      await tellScreenAdmins(deps, school.id, {
        title: 'Pano bağlantısı koptu',
        body: `"${s.name}" panosu ${since}. TV'nin açık olduğunu, elektrik ve internet bağlantısını kontrol edin.`,
        push: `"${s.name}" panosu ${since}. TV'yi ve internet bağlantısını kontrol edin.`,
      });
      sent++;
    }
  }
  return sent;
}

/**
 * Pano görüldü: son görülme en çok dakikada bir yazılır. Kopma bildirimi gönderilmişse sıfırlanır ve
 * "yeniden bağlandı" bildirimi gider.
 */
export async function noteScreenAlive(
  deps: AppDeps,
  screen: Pick<typeof screens.$inferSelect, 'id' | 'schoolId' | 'name' | 'lastSeenAt' | 'offlineAlertAt'>,
  now = new Date(),
): Promise<void> {
  const { db } = deps;
  if (screen.offlineAlertAt) {
    const back = await db
      .update(screens)
      .set({ lastSeenAt: now, offlineAlertAt: null })
      .where(and(eq(screens.id, screen.id), isNotNull(screens.offlineAlertAt)))
      .returning({ id: screens.id });
    if (back.length) {
      const minutes = screen.lastSeenAt ? Math.round((now.getTime() - screen.lastSeenAt.getTime()) / 60_000) : null;
      await tellScreenAdmins(deps, screen.schoolId, {
        title: 'Pano yeniden bağlandı',
        body: `"${screen.name}" panosu yeniden çevrimiçi${minutes ? ` (yaklaşık ${minutes} dakika bağlı değildi)` : ''}.`,
        push: `"${screen.name}" panosu yeniden çevrimiçi.`,
      });
    }
    return;
  }
  if (!screen.lastSeenAt || now.getTime() - screen.lastSeenAt.getTime() > 60_000) {
    await db.update(screens).set({ lastSeenAt: now }).where(eq(screens.id, screen.id));
  }
}

/** Açık bağlantı (SSE) sürerken son görülme dakikada bir yazılır: pano veri çekmese de kopmuş sayılmaz */
export async function touchScreen(deps: Pick<AppDeps, 'db'>, screenId: string, now = new Date()): Promise<void> {
  await deps.db.update(screens).set({ lastSeenAt: now }).where(eq(screens.id, screenId));
}
