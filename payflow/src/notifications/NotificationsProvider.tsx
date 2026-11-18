import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState, Platform } from 'react-native';
import { useStore } from '../store/StoreProvider';
import { buildNotificationPlan, PlannedNotification, planSignature } from './plan';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

interface NotificationsValue {
  permission: PermissionState;
  request: () => Promise<PermissionState>;
  plan: PlannedNotification[];
  sendTest: () => Promise<void>;
}

const Ctx = createContext<NotificationsValue | null>(null);

export const CHANNEL_ID = 'payments';
export const ACTION_PAID = 'paid';
export const ACTION_PAY = 'pay';
export const ACTION_SNOOZE = 'snooze';
const SNOOZE_SECONDS = 2 * 60 * 60;

/** Ön planda gelen bildirimler de banner olarak gösterilsin. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function setupChannelsAndCategories() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Ödeme hatırlatmaları',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#3EE6B0',
      vibrationPattern: [0, 200, 120, 200],
    });
  }
  await Notifications.setNotificationCategoryAsync('bill-reminder', [
    { identifier: ACTION_PAID, buttonTitle: 'Ödedim', options: { opensAppToForeground: true } },
    { identifier: ACTION_SNOOZE, buttonTitle: '2 saat ertele', options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync('card-reminder', [
    { identifier: ACTION_PAY, buttonTitle: 'Ödeme kaydet', options: { opensAppToForeground: true } },
    { identifier: ACTION_SNOOZE, buttonTitle: '2 saat ertele', options: { opensAppToForeground: false } },
  ]);
}

const toState = (s: { granted: boolean; canAskAgain?: boolean; status?: string }): PermissionState =>
  s.granted ? 'granted' : s.status === 'undetermined' || s.canAskAgain ? 'undetermined' : 'denied';

/** Bildirimin ilgili ekranı: fatura → fatura ayrıntısı, kart → kart/ödeme, gelir → tutar girişi. */
export function openTarget(data: { kind?: string; refId?: string; period?: string }, pay = false) {
  if (!data.refId) return;
  if (data.kind === 'bill') router.push(`/bill/${data.refId}`);
  else if (data.kind === 'card' || data.kind === 'statement') {
    if (pay) router.push({ pathname: '/card-pay', params: { id: data.refId } });
    else router.push(`/card/${data.refId}`);
  } else if (data.kind === 'income') router.push({ pathname: '/income-log', params: { id: data.refId, period: data.period ?? '' } });
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { state, dispatch, ready } = useStore();
  const supported = Platform.OS === 'ios' || Platform.OS === 'android';
  const [permission, setPermission] = useState<PermissionState>(supported ? 'undetermined' : 'unsupported');
  const [now, setNow] = useState(() => new Date());
  const lastSignature = useRef<string | null>(null);
  const handled = useRef(new Set<string>());

  // Uygulama öne geldiğinde "şimdi"yi yenile: geçmişte kalan hatırlatmalar düşer, yenileri eklenir.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(new Date());
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!supported) return;
    setupChannelsAndCategories().catch(() => {});
    Notifications.getPermissionsAsync()
      .then((p) => setPermission(toState(p)))
      .catch(() => {});
  }, [supported]);

  const plan = useMemo(() => buildNotificationPlan(state, now), [state, now]);

  // Plan değiştiğinde bekleyen bildirimleri baştan kur.
  useEffect(() => {
    if (!supported || !ready || permission !== 'granted') return;
    const sig = planSignature(plan);
    if (sig === lastSignature.current) return;
    lastSignature.current = sig;
    const t = setTimeout(async () => {
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        for (const p of plan) {
          await Notifications.scheduleNotificationAsync({
            identifier: p.id,
            content: {
              title: p.title,
              body: p.body,
              data: p.data,
              categoryIdentifier: p.category === 'info' ? undefined : p.category,
              sound: 'default',
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.fireAt, channelId: CHANNEL_ID },
          });
        }
      } catch {
        lastSignature.current = null; // bir sonraki değişiklikte tekrar dene
      }
    }, 600);
    return () => clearTimeout(t);
  }, [plan, permission, ready, supported]);

  const handleResponse = useCallback(
    async (response: Notifications.NotificationResponse) => {
      const req = response.notification.request;
      const key = `${req.identifier}:${response.actionIdentifier}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      const data = (req.content.data ?? {}) as { kind?: string; refId?: string; period?: string };

      if (response.actionIdentifier === ACTION_SNOOZE) {
        await Notifications.scheduleNotificationAsync({
          content: { title: req.content.title, body: req.content.body, data: req.content.data, categoryIdentifier: req.content.categoryIdentifier ?? undefined, sound: 'default' },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: SNOOZE_SECONDS, channelId: CHANNEL_ID },
        });
        return;
      }
      if (response.actionIdentifier === ACTION_PAID && data.kind === 'bill' && data.refId && data.period) {
        dispatch({ type: 'bill/markPaid', id: data.refId, period: data.period });
        return;
      }
      openTarget(data, response.actionIdentifier === ACTION_PAY);
    },
    [dispatch],
  );

  // Bildirime/butona dokunma: uygulama açıkken dinleyici, kapalıyken son yanıt.
  useEffect(() => {
    if (!supported || !ready) return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      handleResponse(r).catch(() => {});
    });
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (r) return handleResponse(r).then(() => Notifications.clearLastNotificationResponseAsync());
      })
      .catch(() => {});
    return () => sub.remove();
  }, [handleResponse, ready, supported]);

  const request = useCallback(async () => {
    if (!supported) return 'unsupported' as const;
    const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    const next = toState(r);
    setPermission(next);
    return next;
  }, [supported]);

  const sendTest = useCallback(async () => {
    if (permission !== 'granted') return;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'PayFlow test bildirimi', body: 'Hatırlatmalar bu şekilde gelecek. "Ödedim" ve "Ertele" butonlarını faturalarda göreceksin.', sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL_ID },
    });
  }, [permission]);

  return <Ctx.Provider value={{ permission, request, plan, sendTest }}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotificationsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications, NotificationsProvider içinde kullanılmalı');
  return v;
}
