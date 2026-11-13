import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInbox, useInboxActions, type InboxItem } from './data.ts';
import { Text } from './text.tsx';
import { colors, radius } from './theme.ts';
import { useThemeMode } from './themeMode.tsx';
import { Icon, type IconName } from './ui.tsx';

/*
 * Uygulama açıkken yeni bildirim üstten iner (bildirim kutusu 30 saniyede bir yoklanır; uygulama kapalıyken telefonun
 * kendi bildirimi gelir):
 * - Sıradan bildirim: küçük koyu kutu, 4,5 saniye sonra kendiliğinden kalkar; dokununca ilgili ekran açılır.
 * - İş isteyen bildirim (onay, izin isteği, boş nöbet / ders, katılım isteği): açık renk kart, "Aç" ve "Sonra";
 *   kapatılana kadar kalır.
 * - Acil durum: ekranın tepesinden tam genişlikte kırmızı bant; kendiliğinden kalkmaz.
 * Aynı anda birden fazla yeni bildirim gelirse tek kutu ("3 yeni bildirim") çıkar. Bildirimler ekranındayken çıkmaz.
 * Uygulama açıldığında kutuda zaten olanlar gösterilmez (yalnızca açıkken gelenler).
 */

/** Acil bandı iki temada da aynı koyu kırmızı (koyu temadaki açık kırmızı üzerinde beyaz yazı okunmuyordu) */
const EMERGENCY_RED = '#e11d48';

const ACTION_KINDS = new Set(['approval', 'leave-request', 'duty-gap', 'lesson-cover', 'enroll', 'support-ticket', 'issue', 'meeting']);

const ICONS: Record<string, IconName> = {
  approval: 'checkmark-done-outline',
  approved: 'checkmark-done-outline',
  returned: 'checkmark-done-outline',
  'leave-request': 'calendar-outline',
  'duty-gap': 'shield-checkmark-outline',
  'duty-assign': 'shield-checkmark-outline',
  'lesson-cover': 'people-outline',
  exam: 'school-outline',
  'screen-security': 'tv-outline',
  emergency: 'warning',
};

type Notice = { mode: 'quiet' | 'action' | 'emergency'; item: InboxItem | null; count: number };

/*
 * Deneme (Menü → Hatırlatmalar): üç kutu sırayla yalnızca bu telefonda görünür; sunucuya hiçbir şey gitmez, bildirim
 * kutusuna kayıt düşmez. Bir kutu kapanınca sıradaki gelir.
 */
const testListeners = new Set<(list: Notice[]) => void>();
const fake = (id: string, kind: string, title: string, body: string): InboxItem => ({ id: `test-${id}`, key: `test-${id}`, kind, title, body, at: new Date().toISOString(), to: '/hatirlatmalar', readAt: null, resolvedAt: null });
export function showTestNotices() {
  const list: Notice[] = [
    { mode: 'quiet', count: 1, item: fake('quiet', 'exam', 'Deneme: sıradan bildirim', 'Birkaç saniye sonra kendiliğinden kalkar.') },
    { mode: 'action', count: 1, item: fake('action', 'leave-request', 'Deneme: iş isteyen bildirim', 'Onay ya da görevlendirme gibi işlerde böyle görünür. Kapatınca acil bandı gelir.') },
    { mode: 'emergency', count: 1, item: fake('emergency', 'emergency', 'Deneme: acil durum bandı', 'Gerçek acil durumda kendiliğinden kalkmaz. Kapatmak için dokunun.') },
  ];
  for (const l of testListeners) l(list);
}

export function InAppNotices() {
  const pathname = usePathname();
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  const inbox = useInbox('unread', active ? 30_000 : false);
  const { read } = useInboxActions();
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<Notice[]>([]);
  const notice = queue[0] ?? null;
  const push = (n: Notice) => setQueue((q) => [...q, n]);
  const next = () => setQueue((q) => q.slice(1));

  useEffect(() => {
    const l = (list: Notice[]) => setQueue((q) => [...q, ...list]);
    testListeners.add(l);
    return () => {
      testListeners.delete(l);
    };
  }, []);

  useEffect(() => {
    const items = inbox.data?.items;
    if (!items) return;
    // İlk yüklemede kutudakiler "görüldü" sayılır: uygulama açılınca eski bildirimler üstten inmez
    if (!seen.current) {
      seen.current = new Set(items.map((i) => i.id));
      return;
    }
    const fresh = items.filter((i) => !seen.current!.has(i.id) && !i.readAt && !i.resolvedAt);
    for (const i of items) seen.current.add(i.id);
    if (!fresh.length || pathname.startsWith('/bildirimler')) return;
    const emergency = fresh.find((i) => i.kind === 'emergency');
    if (emergency) push({ mode: 'emergency', item: emergency, count: 1 });
    else if (fresh.length > 1) push({ mode: 'quiet', item: null, count: fresh.length });
    else push({ mode: ACTION_KINDS.has(fresh[0]!.kind) ? 'action' : 'quiet', item: fresh[0]!, count: 1 });
  }, [inbox.data, pathname]);

  if (!notice) return null;
  const open = () => {
    const it = notice.item;
    next();
    // Deneme kutusu: hiçbir yere gitmez, kayıt düşmez
    if (it?.id.startsWith('test-')) return;
    if (it) {
      read.mutate({ ids: [it.id] });
      router.push((it.to || '/bildirimler') as never);
    } else router.push('/bildirimler');
  };
  return <NoticeView key={`${notice.item?.id ?? 'many'}-${notice.count}-${queue.length}`} notice={notice} onOpen={open} onClose={next} />;
}

function NoticeView({ notice, onOpen, onClose }: { notice: Notice; onOpen: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { isDark } = useThemeMode();
  const y = useRef(new Animated.Value(-220)).current;
  const close = useRef(onClose);
  close.current = onClose;
  const hide = () => Animated.timing(y, { toValue: -220, duration: 220, useNativeDriver: true }).start(() => close.current());

  useEffect(() => {
    Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 9, tension: 70 }).start();
    if (notice.mode !== 'quiet') return;
    const t = setTimeout(hide, 4500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const it = notice.item;
  const title = it ? it.title : `${notice.count} yeni bildirim`;
  const body = it ? it.body : 'Görmek için dokunun.';
  const icon = (it && ICONS[it.kind]) ?? 'notifications-outline';

  if (notice.mode === 'emergency')
    return (
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 50, elevation: 50, transform: [{ translateY: y }] }}>
        <Pressable
          accessibilityRole="alert"
          onPress={onOpen}
          style={{ backgroundColor: EMERGENCY_RED, paddingTop: insets.top + 10, paddingBottom: 14, paddingHorizontal: 16, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <Icon name="warning" size={24} color="#ffffff" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15.5, fontWeight: '800', color: '#ffffff' }} numberOfLines={2}>
              {title}
            </Text>
            {body ? (
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.88)' }} numberOfLines={2}>
                {body}
              </Text>
            ) : null}
          </View>
          <View style={{ backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: EMERGENCY_RED }}>Aç</Text>
          </View>
        </Pressable>
      </Animated.View>
    );

  const wrap = { position: 'absolute' as const, left: 12, right: 12, top: insets.top + 8, zIndex: 50, elevation: 50, transform: [{ translateY: y }] };

  if (notice.mode === 'action')
    return (
      <Animated.View style={wrap}>
        <View style={{ backgroundColor: colors.elevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.elevatedBorder, padding: 14, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.warningSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={icon} size={19} color={colors.warning} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14.5, fontWeight: '800', color: colors.ink }} numberOfLines={2}>
                {title}
              </Text>
              {body ? (
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.faint, marginTop: 2 }} numberOfLines={3}>
                  {body}
                </Text>
              ) : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Kapat" hitSlop={10} onPress={hide}>
              <Icon name="close" size={18} color={colors.subtle} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.onPrimary }}>Aç</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={hide}
              style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, opacity: pressed ? 0.8 : 1 })}
            >
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.ink }}>Sonra</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    );

  // Sıradan bildirim: küçük koyu kutu (koyu temada katmanlar ayrışsın diye açık yüzey ve ince çerçeve)
  return (
    <Animated.View style={wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${body}`}
        onPress={onOpen}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          borderRadius: radius.lg,
          backgroundColor: isDark ? colors.elevated : '#1c1917',
          borderWidth: isDark ? 1 : 0,
          borderColor: colors.elevatedBorder,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#F5B83D', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color="#1c1917" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#ffffff' }} numberOfLines={1}>
            {title}
          </Text>
          {body ? (
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.72)' }} numberOfLines={1}>
              {body}
            </Text>
          ) : null}
        </View>
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.5)' }}>şimdi</Text>
      </Pressable>
    </Animated.View>
  );
}
