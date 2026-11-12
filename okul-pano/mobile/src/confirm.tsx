/**
 * Uygulamanın tek onay penceresi: alttan açılan sayfa (webdeki panelle aynı düzen). `await confirm({...})` ile
 * her yerden açılır; `<ConfirmHost />` kök düzende bir kez çizilir. Telefonun kendi uyarı kutusu kullanılmaz.
 *
 * - Ton: nötr, uyarı (turuncu), tehlike (kırmızı); simge ve renk tondan gelir.
 * - `hold`: kritik işlemlerde onay düğmesine 1,5 sn basılı tutmak gerekir; çubuk dolarken bırakılırsa boşalır.
 * - Dışarı dokunmak, geri tuşu ve Vazgeç "hayır" sayılır.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from './icons.tsx';
import { Text } from './text.tsx';
import { colors, dark } from './theme.ts';
import { Icon } from './ui.tsx';

export type ConfirmTone = 'neutral' | 'warning' | 'danger';

export type ConfirmOptions = {
  title: string;
  /** Başlığın altındaki soluk satır (ör. okul adı) */
  subtitle?: string;
  message?: string;
  /** "Ne olur?" listesi: ok=true yeşil tik (korunan), diğerleri kırmızı çarpı */
  effects?: { text: string; ok?: boolean }[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: IconName;
  hold?: boolean;
  holdLabel?: string;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openConfirm(options: ConfirmOptions): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...options, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  const p = current;
  current = null;
  emit();
  p?.resolve(ok);
}

function tones(tone: ConfirmTone) {
  if (tone === 'danger') return { soft: colors.dangerSoft, fg: colors.danger, solid: colors.danger, onSolid: dark ? '#1d0a10' : '#ffffff', icon: 'trash-outline' as IconName };
  if (tone === 'warning') return { soft: colors.warningSoft, fg: colors.warning, solid: colors.warning, onSolid: dark ? '#1c1206' : '#ffffff', icon: 'warning-outline' as IconName };
  return { soft: colors.primarySoft, fg: colors.ink, solid: colors.primary, onSolid: colors.onPrimary, icon: 'alert-circle-outline' as IconName };
}

const HOLD_MS = 1500;

/** Basılı tutunca soldan dolan onay düğmesi; dolunca onaylar, erken bırakılırsa boşalır */
function HoldButton({ label, tone, onDone }: { label: string; tone: ConfirmTone; onDone: () => void }) {
  const t = tones(tone);
  const p = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  const done = useRef(false);
  const begin = () => {
    if (done.current) return;
    void Haptics.selectionAsync().catch(() => {});
    Animated.timing(p, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (!finished || done.current) return;
      done.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDone();
    });
  };
  const end = () => {
    if (done.current) return;
    p.stopAnimation();
    Animated.timing(p, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };
  const width = p.interpolate({ inputRange: [0, 1], outputRange: [0, w] });
  const text = { fontSize: 15, fontWeight: '800' as const };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Onaylamak için basılı tutun"
      onPressIn={begin}
      onPressOut={end}
      delayLongPress={HOLD_MS + 1000}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ flex: 1, height: 52, borderRadius: 16, backgroundColor: t.soft, overflow: 'hidden', justifyContent: 'center' }}
    >
      <Text style={[text, { color: t.fg, textAlign: 'center' }]}>{label}</Text>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width, backgroundColor: t.solid, overflow: 'hidden' }}>
        <View style={{ width: w, height: '100%', justifyContent: 'center' }}>
          <Text style={[text, { color: t.onSolid, textAlign: 'center' }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function ConfirmHost() {
  const pending = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  const insets = useSafeAreaInsets();
  // Son içerik kapanış sırasında da görünsün (pencere boşalarak kapanmasın)
  const [shown, setShown] = useState<Pending | null>(null);
  useEffect(() => {
    if (pending) setShown(pending);
  }, [pending]);
  const o = pending ?? shown;
  if (!o) return null;

  const tone = o.tone ?? 'danger';
  const t = tones(tone);
  const label = o.confirmLabel ?? (tone === 'danger' ? 'Sil' : 'Onayla');
  return (
    <Modal visible={Boolean(pending)} transparent animationType="slide" statusBarTranslucent onRequestClose={() => settle(false)} onDismiss={() => setShown(null)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Vazgeç" onPress={() => settle(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim }} />
        <View
          accessibilityViewIsModal
          style={{ backgroundColor: colors.elevated, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.elevatedBorder, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 + insets.bottom }}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={o.icon ?? t.icon} size={24} color={t.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 19, fontWeight: '800', color: colors.ink }} accessibilityRole="header">
                {o.title}
              </Text>
              {o.subtitle ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{o.subtitle}</Text> : null}
            </View>
          </View>
          {o.message ? <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 14 }}>{o.message}</Text> : null}
          {o.effects?.length ? (
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 }}>
              {o.effects.map((e) => (
                <View key={e.text} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      marginTop: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: e.ok ? colors.successSoft : colors.dangerSoft,
                    }}
                  >
                    <Icon name={e.ok ? 'checkmark' : 'close'} size={12} strokeWidth={3} color={e.ok ? colors.success : colors.danger} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.ink }}>{e.text}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
            {o.hold ? null : (
              <Pressable
                accessibilityRole="button"
                onPress={() => settle(false)}
                style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{o.cancelLabel ?? 'Vazgeç'}</Text>
              </Pressable>
            )}
            {o.hold ? (
              <HoldButton key={String(pending !== null)} label={o.holdLabel ?? 'Onaylamak için basılı tutun'} tone={tone} onDone={() => settle(true)} />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => settle(true)}
                style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 16, backgroundColor: t.solid, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: t.onSolid }}>{label}</Text>
              </Pressable>
            )}
          </View>
          {o.hold ? (
            <Pressable accessibilityRole="button" onPress={() => settle(false)} style={{ alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 24, marginTop: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.muted }}>{o.cancelLabel ?? 'Vazgeç'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
