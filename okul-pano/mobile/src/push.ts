import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api.ts';
import { storage } from './storage.ts';

const MUTED_BASE = 'okulpano.pushMuted';
/** Telefonun bildirim anahtarı (telefona ait; birden fazla hesap aynı anahtarla bağlanır) */
const TOKEN_KEY = 'okulpano.pushToken';

/**
 * Bildirim ayarı hesap başınadır (hızlı hesap geçişi): açık hesap AuthProvider'dan bildirilir. Kapatma bilgisi
 * hesabın kimliğiyle saklanır; eski sürümden kalan tek anahtar ilk hesaba sayılır.
 */
let activeUser: string | null = null;
export function setPushUser(id: string | null) {
  activeUser = id;
}
const mutedKey = (userId: string | null = activeUser) => (userId ? `${MUTED_BASE}.${userId}` : MUTED_BASE);
export async function isMuted(userId: string | null = activeUser): Promise<boolean> {
  return Boolean((await storage.get(mutedKey(userId))) ?? (await storage.get(MUTED_BASE)));
}
export async function setMuted(userId: string, muted: boolean) {
  await storage.set(mutedKey(userId), muted ? '1' : null);
  await storage.set(MUTED_BASE, null);
}
/** Bu telefonun bildirim anahtarı (daha önce alındıysa) */
export const deviceToken = () => storage.get(TOKEN_KEY);

// Uygulama açıkken gelen bildirim de üstte görünsün
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/**
 * Uygulamanın kendi bildirim sesi (assets/sounds/okul_yayin.wav, app.json'da expo-notifications "sounds"). Android'de
 * ses kanala bağlıdır ve kanal kurulduktan sonra değiştirilemez; bu yüzden sesli kanal yeni bir kimlikle açılır. Eski
 * "default" kanalı kaldırılır. Sunucu bildirimleri de bu kanala gönderilir (apps/api/src/lib/push.ts).
 */
export const CHANNEL_ID = 'okul-yayin';
export const SOUND = 'okul_yayin.wav';

let channelReady: Promise<void> | null = null;
export function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelReady ??= (async () => {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Okul Yayın',
      importance: Notifications.AndroidImportance.HIGH,
      sound: SOUND,
      vibrationPattern: [0, 200, 120, 200],
    });
    await Notifications.deleteNotificationChannelAsync('default').catch(() => undefined);
  })().catch(() => {
    channelReady = null;
  });
  return channelReady;
}

/**
 * Telefon bildirimleri için cihazı kaydeder (onay bekleyen duyuru, acil durum, nöbet görevlendirmesi…).
 * - ok: bu telefon sunucudan bildirim alır
 * - local: izin verildi, telefondaki hatırlatmalar (nöbet sabahı) çalışır; ama uygulamada bildirim hizmeti
 *   (Firebase / Expo projesi) tanımlı olmadığı için sunucudan gelen bildirimler bu sürümde gelmez
 * - denied: izin verilmedi · unavailable: web ya da emülatör
 */
export async function registerForPush(opts: { auto?: boolean } = {}): Promise<'ok' | 'local' | 'denied' | 'unavailable' | 'off'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  // Kullanıcı menüden kapattıysa açılışta kendiliğinden yeniden açılmaz
  if (opts.auto && (await isMuted())) return 'off';
  if (!opts.auto && activeUser) await setMuted(activeUser, false);
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return 'denied';
  let token: string;
  try {
    if (Platform.OS === 'android') {
      // Android: telefonun doğrudan Firebase (FCM) anahtarı; sunucu Firebase'e kendisi gönderir (Expo hesabı gerekmez).
      // Uygulama Firebase ayarı (google-services.json) olmadan derlendiyse anahtar alınamaz: yalnızca yerel hatırlatmalar.
      token = String((await Notifications.getDevicePushTokenAsync()).data);
    } else {
      const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) return 'local';
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    }
  } catch (err) {
    console.warn('Bildirim anahtarı alınamadı:', (err as Error).message);
    return 'local';
  }
  const previous = await storage.get(TOKEN_KEY);
  await api('/api/me/push-tokens', { method: 'POST', body: { token, platform: Platform.OS } });
  // Anahtar değiştiyse (ör. Expo'dan Firebase'e geçiş) eskisi bu hesaptan kaldırılır
  if (previous && previous !== token) await api('/api/me/push-tokens', { method: 'DELETE', body: { token: previous } }).catch(() => undefined);
  await storage.set(TOKEN_KEY, token);
  return 'ok';
}

export type PushState = 'ok' | 'local' | 'off' | 'denied' | 'unavailable';

/**
 * Şu anki durum (menüye her girişte okunur; dokunmadan önce de doğru görünsün):
 * ok bu telefon sunucudan bildirim alıyor · local izin var ama sunucu bildirimi kurulmamış · off henüz izin istenmedi ·
 * denied izin verilmedi (telefon ayarlarından açılır) · unavailable web ya da emülatör
 */
export async function pushStatus(): Promise<PushState> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return perm.canAskAgain === false ? 'denied' : 'off';
  if (await isMuted()) return 'off';
  return (await storage.get(TOKEN_KEY)) ? 'ok' : 'local';
}

/** Durumun menüde görünen açıklaması */
export const PUSH_TEXT: Record<PushState, string> = {
  ok: 'Açık: bu telefon onay, acil durum ve görev bildirimlerini alır.',
  local: 'İzin verildi: nöbet hatırlatmaları çalışır. Sunucudan gelen bildirimler (onay, acil durum) bu sürümde kurulu değil.',
  off: 'Kapalı: açmak için dokunun.',
  denied: 'İzin verilmedi: telefon ayarlarından Okul Yayın için bildirimleri açın.',
  unavailable: 'Bu cihazda kullanılamıyor.',
};

/** Menüden kapatma: bu telefon sunucudan bildirim almaz ve açılışta kendiliğinden yeniden açılmaz */
export async function mutePush() {
  await unregisterPush();
  if (activeUser) await setMuted(activeUser, true);
}

/**
 * Açık hesabın bu telefondaki bildirim bağını kaldırır (çıkış, kapatma). Telefonun anahtarı silinmez: telefonda
 * kayıtlı diğer hesapların bildirimleri gelmeye devam eder.
 */
export async function unregisterPush() {
  const token = await storage.get(TOKEN_KEY);
  if (!token) return;
  await api('/api/me/push-tokens', { method: 'DELETE', body: { token } }).catch(() => undefined);
}

/**
 * Hatırlatmalar telefonda yerel olarak kurulur (sunucu ve internet gerekmez); her kurulumda aynı türdeki
 * öncekiler silinir. Tür: "duty" (nöbet) ya da "exam" (sınav takvimi).
 */
export async function scheduleReminders(items: { at: Date; title: string; body: string; url: string }[], kind: 'duty' | 'exam' = 'duty'): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return false;
  await ensureChannel();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => (n.content.data as { kind?: string } | undefined)?.kind === kind).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  for (const item of items) {
    if (item.at.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: item.title, body: item.body, sound: SOUND, data: { kind, url: item.url } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.at, channelId: CHANNEL_ID },
    });
  }
  return true;
}

/**
 * Telefonda kurulan sınav hatırlatmalarını sunucuya bildirir: sunucu bu telefona aynılarını ayrıca göndermez
 * (çift bildirim olmaz). Bu telefonun sunucu bildirim anahtarı yoksa bildirilecek bir şey yoktur.
 */
export async function ackExamReminders(items: { examId: string; notifyAt: string }[]) {
  const token = await storage.get(TOKEN_KEY);
  if (!token) return;
  await api('/api/me/exam-reminders', { method: 'POST', body: { token, items } }).catch(() => undefined);
}

/** Deneme bildirimi: birkaç saniye sonra gelir (izin yoksa önce izin istenir) */
export async function sendTestNotification(): Promise<'ok' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return 'denied';
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Okul Yayın bildirimleri açık', body: 'Bildirimler bu sesle ve bu şekilde telefonunuza gelecek.', sound: SOUND, data: { kind: 'test', url: '/hatirlatmalar' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId: CHANNEL_ID },
  });
  return 'ok';
}
