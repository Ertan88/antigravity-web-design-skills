import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api.ts';
import { storage } from './storage.ts';

const TOKEN_KEY = 'okulpano.pushToken';

// Uygulama açıkken gelen bildirim de üstte görünsün
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/**
 * Telefon bildirimleri için cihazı kaydeder (onay bekleyen duyuru, acil durum, nöbet görevlendirmesi…).
 * - ok: bu telefon sunucudan bildirim alır
 * - local: izin verildi, telefondaki hatırlatmalar (nöbet sabahı) çalışır; ama uygulamada bildirim hizmeti
 *   (Firebase / Expo projesi) tanımlı olmadığı için sunucudan gelen bildirimler bu sürümde gelmez
 * - denied: izin verilmedi · unavailable: web ya da emülatör
 */
export async function registerForPush(): Promise<'ok' | 'local' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Okul Yayın',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return 'denied';
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return 'local';
  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (err) {
    console.warn('Bildirim anahtarı alınamadı:', (err as Error).message);
    return 'local';
  }
  await api('/api/me/push-tokens', { method: 'POST', body: { token, platform: Platform.OS } });
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

/** Çıkışta bu telefon artık bildirim almaz */
export async function unregisterPush() {
  const token = await storage.get(TOKEN_KEY);
  if (!token) return;
  await api('/api/me/push-tokens', { method: 'DELETE', body: { token } }).catch(() => undefined);
  await storage.set(TOKEN_KEY, null);
}

/** Nöbet hatırlatmaları telefonda yerel olarak kurulur (sunucu gerekmez); her kurulumda öncekiler silinir */
export async function scheduleReminders(items: { at: Date; title: string; body: string; url: string }[]) {
  if (Platform.OS === 'web') return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => (n.content.data as { kind?: string } | undefined)?.kind === 'duty').map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  for (const item of items) {
    if (item.at.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: item.title, body: item.body, data: { kind: 'duty', url: item.url } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.at },
    });
  }
}

/** Deneme bildirimi: birkaç saniye sonra gelir (izin yoksa önce izin istenir) */
export async function sendTestNotification(): Promise<'ok' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return 'denied';
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Nöbet hatırlatmaları açık', body: 'Hatırlatmalar bu şekilde telefonunuza gelecek.', data: { kind: 'test', url: '/hatirlatmalar' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3 },
  });
  return 'ok';
}
