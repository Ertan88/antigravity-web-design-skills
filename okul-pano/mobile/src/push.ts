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
 * İzin verilmezse, emülatörde ya da Expo hesabı (projectId) tanımlı değilse sessizce vazgeçer.
 */
export async function registerForPush(): Promise<'ok' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Panokul',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return 'denied';
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api('/api/me/push-tokens', { method: 'POST', body: { token, platform: Platform.OS } });
    await storage.set(TOKEN_KEY, token);
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

/** Çıkışta bu telefon artık bildirim almaz */
export async function unregisterPush() {
  const token = await storage.get(TOKEN_KEY);
  if (!token) return;
  await api('/api/me/push-tokens', { method: 'DELETE', body: { token } }).catch(() => undefined);
  await storage.set(TOKEN_KEY, null);
}

/**
 * Nöbet hatırlatmaları telefonda yerel olarak kurulur (sunucu gerekmez): nöbet günü ilk dersten
 * 15 dakika önce "Bugün nöbetçisiniz" bildirimi. Her açılışta yeniden kurulur.
 */
export async function scheduleDutyReminders(items: { date: string; time: string; area: string }[]) {
  if (Platform.OS === 'web') return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => (n.content.data as { kind?: string } | undefined)?.kind === 'duty').map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  for (const item of items) {
    const at = new Date(`${item.date}T${item.time}:00`);
    at.setMinutes(at.getMinutes() - 15);
    if (at.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Bugün nöbetçisiniz', body: `${item.area} · teneffüslerde`, data: { kind: 'duty', url: '/nobet' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  }
}
