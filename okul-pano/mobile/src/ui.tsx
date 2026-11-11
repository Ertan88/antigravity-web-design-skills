import { errorText } from '@okulpano/shared';
import { router, usePathname, useRoute } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, TextInput as NativeTextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Text, TextInput } from './text.tsx';
import { ICONS, type IconName } from './icons.tsx';
import { openConfirm, type ConfirmOptions } from './confirm.tsx';
import { SpecialDayStrip } from './specialDay.tsx';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scrollMemory, scrollRestore } from './scroll.ts';
import { colors, dark, radius, space, tiles, type TileTone } from './theme.ts';
import { shortSchoolName } from '@okulpano/shared/schoolName';
import { dayTitle, greeting, localIso } from './day.ts';

export type { IconName } from './icons.tsx';

/** Simge (Tabler); `name` kısa addır, karşılığı src/icons.tsx'te */
export function Icon({ name, size = 22, color = colors.ink, strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const C = ICONS[name];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <C size={size} color={color} strokeWidth={strokeWidth} />
    </View>
  );
}

/**
 * Ekran iskeleti: güvenli alan, başlık (geri düğmesi isteğe bağlı), kaydırılabilir gövde ve
 * altta sabit düğme alanı. Aşağı çekince yenilenir.
 */
/**
 * Kaydırma belleğinin anahtarı: ekranın kendi kimliği (rota adı ve parametreleri). Adres (yol) tema değişince
 * yeniden kurulan gezinmede bir an önceki ekranı gösterebildiği için kullanılmaz; aksi halde ekran başka bir
 * ekranın konumuna (ör. en üste) kaydırılıyordu.
 */
function useScrollKey(): string {
  const pathname = usePathname();
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const route = useRoute();
    return `${route.name}|${JSON.stringify(route.params ?? {})}`;
  } catch {
    return pathname;
  }
}

/**
 * Odaktaki yazı kutusunu, içinde bulunduğu kaydırma alanında klavyenin üstünde görünür kılar. Klavye ilk
 * açıldığında da, klavyedeki "İleri" ile sonraki kutuya geçildiğinde de (klavye zaten açıkken) çağrılır.
 */
export function revealFocused(scroller: ComponentRef<typeof ScrollView> | null, viewHeight: number, offset: number, below = 96) {
  // Web'de tarayıcı odaktaki kutuyu kendisi gösterir (bu işlev orada yoktur)
  if (Platform.OS === 'web' || typeof NativeTextInput.State?.currentlyFocusedInput !== 'function') return;
  const input = NativeTextInput.State.currentlyFocusedInput();
  const inner = scroller?.getInnerViewRef?.();
  if (!input || !inner || !viewHeight) return;
  input.measureLayout(
    inner as never,
    (_x, y, _w, h) => {
      const top = y - 24;
      const bottom = y + h + below;
      if (top < offset) scroller?.scrollTo({ y: Math.max(0, top), animated: true });
      else if (bottom > offset + viewHeight) scroller?.scrollTo({ y: bottom - viewHeight, animated: true });
    },
    () => undefined,
  );
}

/** Yazı kutusu odaklanınca bulunduğu kaydırma alanına "beni göster" der (Screen ve SheetScroll sağlar) */
export const FocusRevealContext = createContext<(() => void) | null>(null);

type InputRef = ComponentRef<typeof NativeTextInput>;
type ChainEntry = { ref: { current: InputRef | null }; y: number; seq: number; skip: boolean };

/**
 * Bir ekrandaki (ya da alttan açılan sayfadaki) yazı kutularının sırası: kutular ekrandaki yerlerine göre
 * (yukarıdan aşağı) dizilir. Altında başka kutu olan kutunun klavye tuşu "İleri" olur ve sonrakine geçer;
 * son kutununki "Tamam" olur ve klavyeyi kapatır.
 */
export class FieldChain {
  private entries = new Map<number, ChainEntry>();
  private listeners = new Set<() => void>();
  private seq = 0;
  private version = 0;
  constructor(private getInner: () => unknown) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  snapshot = () => this.version;
  private changed() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  register(ref: ChainEntry['ref'], skip: boolean): number {
    const id = ++this.seq;
    this.entries.set(id, { ref, y: Number.MAX_SAFE_INTEGER / 2 + id, seq: id, skip });
    this.changed();
    return id;
  }
  unregister(id: number) {
    if (this.entries.delete(id)) this.changed();
  }
  setSkip(id: number, skip: boolean) {
    const e = this.entries.get(id);
    if (e && e.skip !== skip) {
      e.skip = skip;
      this.changed();
    }
  }
  /** Kutunun ekrandaki yeri ölçülür (kaydırma alanının içine göre) */
  measure(id: number) {
    const e = this.entries.get(id);
    const inner = this.getInner();
    if (!e?.ref.current || !inner) return;
    e.ref.current.measureLayout(
      inner as never,
      (_x, y) => {
        if (Math.abs(e.y - y) > 0.5) {
          e.y = y;
          this.changed();
        }
      },
      () => undefined,
    );
  }
  private ordered() {
    return [...this.entries.entries()].filter(([, e]) => !e.skip).sort((a, b) => a[1].y - b[1].y || a[1].seq - b[1].seq);
  }
  next(id: number): ChainEntry | null {
    const list = this.ordered();
    const i = list.findIndex(([k]) => k === id);
    return i >= 0 ? (list[i + 1]?.[1] ?? null) : null;
  }
}

export const FieldChainContext = createContext<FieldChain | null>(null);

const noopSubscribe = () => () => undefined;
const zero = () => 0;

/** Ekran ya da sayfa kendi kutu sırasını tutar */
export function useFieldChain(getInner: () => unknown): FieldChain {
  const [chain] = useState(() => new FieldChain(getInner));
  return chain;
}

export function Screen({
  title,
  subtitle,
  back,
  right,
  children,
  footer,
  refreshing,
  onRefresh,
  tone = 'default',
  scroll = true,
}: {
  title?: string;
  subtitle?: ReactNode;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  tone?: 'default' | 'danger';
  scroll?: boolean;
}) {
  const bg = tone === 'danger' ? colors.dangerTint : colors.bg;
  // Kaydırma konumu saklanır; tema değişince ekran yeniden kurulduğunda aynı yere dönülür
  const path = useScrollKey();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const viewH = useRef(0);
  const contentH = useRef(0);
  // Tema değişince ekran yeniden kurulur ve saklı konuma dönülür. İçerik birkaç adımda yerine oturur (sonradan
  // gelen veriler, üstteki kartlar); o yüzden kısa bir süre boyunca içerik her değiştiğinde konum yeniden uygulanır.
  // Böylece ekran bırakıldığı yerde kalır. Kullanıcı bu sırada kendisi kaydırırsa geri yükleme hemen biter.
  const settling = useRef(false);
  const target = useRef(0);
  if (scrollRestore.has(path) && !settling.current) {
    settling.current = true;
    target.current = scrollMemory.get(path) ?? 0;
    scrollRestore.delete(path);
  }
  const tryRestore = () => {
    if (!settling.current || !viewH.current) return;
    const max = Math.max(0, contentH.current - viewH.current);
    scroller.current?.scrollTo({ y: Math.min(target.current, max), animated: false });
  };
  useEffect(() => {
    if (!settling.current) return;
    const t = setTimeout(() => {
      tryRestore();
      settling.current = false;
      scrollMemory.set(path, Math.min(target.current, Math.max(0, contentH.current - viewH.current)));
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  // Odaktaki yazı kutusu klavyenin üstünde kalacak şekilde kaydırılır: klavye açılınca ve kutudan kutuya geçince.
  // İçerik kısaldıktan sonra ölçülür (görünen yükseklik güncellensin)
  const reveal = useCallback(() => {
    if (!scroll) return;
    setTimeout(() => revealFocused(scroller.current, viewH.current, scrollMemory.get(path) ?? 0), 120);
  }, [scroll, path]);
  useEffect(() => {
    if (!scroll) return;
    const sub = Keyboard.addListener('keyboardDidShow', reveal);
    return () => sub.remove();
  }, [scroll, reveal]);
  // Yenileme simgesi yalnızca kullanıcı aşağı çekince görünür; ekran açılırken arkada yapılan tazelemede görünmez
  const [pulled, setPulled] = useState(false);
  const sawRefresh = useRef(false);
  useEffect(() => {
    if (!pulled) return;
    if (refreshing) sawRefresh.current = true;
    else if (sawRefresh.current) setPulled(false);
    // Tazeleme hiç başlamazsa (ör. veri zaten güncel) simge kısa süre sonra kalkar
    const t = setTimeout(() => setPulled(false), 4000);
    return () => clearTimeout(t);
  }, [pulled, refreshing]);
  const pull = () => {
    sawRefresh.current = false;
    setPulled(true);
    onRefresh?.();
    setTimeout(() => !sawRefresh.current && setPulled(false), 600);
  };
  const chain = useFieldChain(() => scroller.current?.getInnerViewRef?.() ?? null);
  const body = (
    <FieldChainContext.Provider value={chain}>
      <FocusRevealContext.Provider value={reveal}>
        <View style={styles.body}>{children}</View>
      </FocusRevealContext.Provider>
    </FieldChainContext.Provider>
  );
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bg }]} edges={['top', 'left', 'right']}>
      {(title || back) && (
        <View style={styles.header}>
          {back && (
            <Pressable accessibilityRole="button" accessibilityLabel="Geri" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.iconButton}>
              <Icon name="chevron-back" size={22} />
            </Pressable>
          )}
          <View style={{ flex: 1, minWidth: 0, paddingLeft: back ? 0 : space.xs }}>
            {title && (
              <Text style={back ? styles.titleSmall : styles.title} numberOfLines={1} accessibilityRole="header">
                {title}
              </Text>
            )}
            {subtitle ? typeof subtitle === 'string' ? <Text style={styles.subtitle}>{subtitle}</Text> : subtitle : null}
          </View>
          {right}
        </View>
      )}
      {/* Klavye açılınca içerik kısalır (Android kenardan kenara çizimde pencere küçülmez) ve odaktaki kutu görünür kalır */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} enabled={Platform.OS !== 'web'}>
      {scroll ? (
        <ScrollView showsVerticalScrollIndicator={false}
          ref={scroller}
          style={{ flex: 1 }}
          scrollEventThrottle={100}
          onScroll={(e) => {
            // Geri yükleme sürerken gelen kaydırma olayları (yeniden kurulumdaki 0 gibi) saklı konumu ezmesin
            if (!settling.current) scrollMemory.set(path, e.nativeEvent.contentOffset.y);
          }}
          onScrollBeginDrag={() => {
            // Kullanıcı kaydırmaya başladı: geri yükleme biter, artık onun konumu geçerli
            settling.current = false;
          }}
          onMomentumScrollEnd={(e) => {
            if (!settling.current) scrollMemory.set(path, e.nativeEvent.contentOffset.y);
          }}
          onScrollEndDrag={(e) => {
            if (!settling.current) scrollMemory.set(path, e.nativeEvent.contentOffset.y);
          }}
          onLayout={(e) => {
            viewH.current = e.nativeEvent.layout.height;
            tryRestore();
          }}
          onContentSizeChange={(_, h) => {
            contentH.current = h;
            tryRestore();
          }}
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={pulled} onRefresh={pull} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {footer && <SafeAreaView edges={['bottom']} style={styles.footer}>{footer}</SafeAreaView>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style, tone = 'default' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'default' | 'warning' | 'danger' | 'primary' }) {
  return <View style={[styles.card, tone === 'warning' && styles.cardWarning, tone === 'danger' && styles.cardDanger, tone === 'primary' && styles.cardPrimary, style]}>{children}</View>;
}

/** Küçük üst başlık; büyük harfe Türkçe kurala göre çevrilir (i → İ) */
export function Label({ children, color = colors.muted }: { children: ReactNode; color?: string }) {
  const text = typeof children === 'string' ? children.toLocaleUpperCase('tr-TR') : children;
  return <Text style={[styles.label, { color }]}>{text}</Text>;
}

export function T({ children, size = 15, weight = '400', color = colors.ink, style, lines }: { children: ReactNode; size?: number; weight?: '400' | '500' | '600' | '700' | '800'; color?: string; style?: StyleProp<import('react-native').TextStyle>; lines?: number }) {
  return (
    <Text style={[{ fontSize: size, fontWeight: weight, color, lineHeight: Math.round(size * 1.35) }, style]} numberOfLines={lines}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

/**
 * delete: silme ve kaldırma düğmelerinin ortak görünüşü (yumuşak kırmızı: açık kırmızı zemin, kırmızı yazı, ince
 * kırmızı çerçeve; koyu temada koyu kırmızı zemin, açık kırmızı yazı). Her silme düğmesi bunu ya da
 * DeleteIconButton'ı kullanır. danger (dolu kırmızı) yalnızca onay penceresindeki son adım gibi yerler içindir.
 */
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'delete' | 'success' | 'ghost';

export function Button({
  children,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  size = 'md',
  style,
  accessibilityLabel,
}: {
  /** Yazısız (yalnız simgeli) düğmede boş bırakılır; o zaman accessibilityLabel verilmelidir */
  children?: ReactNode;
  accessibilityLabel?: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const v = BUTTONS[variant];
  const h = size === 'sm' ? 40 : size === 'lg' ? 56 : 52;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { height: h, backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <Icon name={icon} size={size === 'sm' ? 17 : 20} color={v.fg} /> : null}
      {children != null && children !== '' ? <Text style={{ color: v.fg, fontSize: size === 'sm' ? 14 : 15.5, fontWeight: '700' }}>{children}</Text> : null}
    </Pressable>
  );
}

// Getter: renkler temaya göre değiştiği için her çizimde güncel değer okunur
const BUTTONS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  get primary() {
    return { bg: colors.primary, fg: colors.onPrimary, border: colors.primary };
  },
  get secondary() {
    return { bg: colors.card, fg: colors.ink, border: colors.borderStrong };
  },
  get danger() {
    return { bg: '#e11d48', fg: '#fff', border: '#e11d48' };
  },
  get delete() {
    return { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerBorder };
  },
  get success() {
    return { bg: colors.success, fg: dark ? '#0f0e0d' : '#fff', border: colors.success };
  },
  get ghost() {
    return { bg: 'transparent', fg: colors.primary, border: 'transparent' };
  },
};

/** Satırlardaki çöp kutusu düğmesi: Button variant="delete" ile aynı yumuşak kırmızı (açık ve koyu temada) */
/**
 * Satır işlemleri (düzenle / sil) her ekranda aynı biçimdedir: 36 px yuvarlatılmış kare, yan yana; kalem gri,
 * çöp yumuşak kırmızı (web ile aynı). Tek tek boyut ve renk verilmez.
 */
function ActionIconButton({ label, onPress, size = 36, disabled, tone }: { label: string; onPress: () => void; size?: number; disabled?: boolean; tone: 'edit' | 'delete' }) {
  const del = tone === 'delete';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        borderWidth: 1,
        borderColor: del ? colors.dangerBorder : colors.borderStrong,
        backgroundColor: del ? colors.dangerSoft : colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      })}
    >
      <Icon name={del ? 'trash-outline' : 'create-outline'} size={Math.round(size * 0.47)} color={del ? colors.danger : colors.muted} />
    </Pressable>
  );
}

export function DeleteIconButton(props: { label: string; onPress: () => void; size?: number; disabled?: boolean }) {
  return <ActionIconButton {...props} tone="delete" />;
}

export function EditIconButton(props: { label: string; onPress: () => void; size?: number; disabled?: boolean }) {
  return <ActionIconButton {...props} tone="edit" />;
}

/** Seçilebilir küçük düğme (şablon, süre, görünüm seçimi) */
export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {icon && <Icon name={icon} size={16} color={selected ? colors.onPrimary : colors.ink} />}
      <Text style={{ flexShrink: 1, fontSize: 14, fontWeight: selected ? '700' : '600', color: selected ? colors.onPrimary : colors.ink }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Birden çok seçenekten biri (ör. ekran modu): kalın çerçeveli kutular */
export function Choice<V extends string | number>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { value: V; label: string; description?: string }[];
  value: V;
  onChange: (v: V) => void;
  columns?: number;
}) {
  return (
    <View style={styles.choiceGrid}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[styles.choice, { width: columns === 1 ? '100%' : `${100 / columns - 2}%` }, on && styles.choiceOn]}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: on ? colors.primary : colors.ink }}>{o.label}</Text>
            {o.description && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{o.description}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={[styles.segment, on && styles.segmentOn]}>
            <Text style={{ fontSize: 14, fontWeight: on ? '700' : '600', color: on ? colors.ink : colors.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, error, help, ...input }: TextInputProps & { label: string; error?: string | null; help?: string }) {
  const reveal = useContext(FocusRevealContext);
  const chain = useContext(FieldChainContext);
  const ref = useRef<InputRef | null>(null);
  const id = useRef(0);
  const [focused, setFocused] = useState(false);
  // Çok satırlı ve kapalı kutular sıraya girmez (Enter alt satıra geçer / yazılamaz)
  const skip = Boolean(input.multiline) || input.editable === false;
  useEffect(() => {
    if (!chain) return;
    id.current = chain.register(ref, skip);
    return () => chain.unregister(id.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);
  useEffect(() => {
    chain?.setSkip(id.current, skip);
  }, [chain, skip]);
  // Sıra değişince (kutu eklendi / kalktı / yer değiştirdi) klavye tuşu yeniden belirlenir
  useSyncExternalStore(chain?.subscribe ?? noopSubscribe, chain?.snapshot ?? zero);
  const next = chain && !skip ? chain.next(id.current) : null;
  // Ekran kendi tuşunu belirlediyse (ör. giriş ekranında "Git") ona dokunulmaz
  const own = input.returnKeyType !== undefined || input.onSubmitEditing !== undefined;
  const chained = !own && !skip && chain !== null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {/* Kutu yuvarlak köşelerle kırpılır: sistemin doldurma / seçim zemini köşelerden taşmaz */}
      <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.subtle}
          {...(chained ? { returnKeyType: next ? 'next' : 'done', submitBehavior: next ? 'submit' : 'blurAndSubmit' } : {})}
          {...input}
          onLayout={(e) => {
            input.onLayout?.(e);
            chain?.measure(id.current);
          }}
          onFocus={(e) => {
            input.onFocus?.(e);
            setFocused(true);
            chain?.measure(id.current);
            // "İleri" ile gelindiğinde klavye zaten açıktır: kutu klavyenin altında kalmasın
            reveal?.();
          }}
          onBlur={(e) => {
            input.onBlur?.(e);
            setFocused(false);
          }}
          onSubmitEditing={(e) => {
            input.onSubmitEditing?.(e);
            if (chained && next) next.ref.current?.focus();
          }}
          style={[
            styles.input,
            input.multiline && { height: undefined, minHeight: 92, paddingTop: 12, textAlignVertical: 'top' },
            // Yazılan kutu belli olsun: kalın, vurgu renginde çerçeve (kalınlık farkı iç boşluktan düşülür)
            focused && { borderWidth: 2, borderColor: colors.info, paddingHorizontal: 15 },
            // Web'de tarayıcının kendi odak çizgisi bu çerçevenin üstüne binmesin
            Platform.OS === 'web' && ({ outlineStyle: 'none' } as object),
            error ? { borderColor: colors.danger } : null,
            input.style,
          ]}
        />
      </View>
      {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : help ? <Text style={{ color: colors.faint, fontSize: 12 }}>{help}</Text> : null}
    </View>
  );
}

export function ToggleRow({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>{label}</Text>
        {description && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{description}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} {...switchColors()} accessibilityLabel={label} />
    </View>
  );
}

/** Dokunulabilir liste satırı (sağda ok) */
export function ListRow({
  title,
  subtitle,
  icon,
  tile,
  iconTone = 'primary',
  right,
  onPress,
  last,
}: {
  title: string;
  subtitle?: string | null;
  icon?: IconName;
  /** Renkli simge kutusu (zemini bento kutusu tonunda) */
  tile?: { icon: IconName; tone: TileTone };
  iconTone?: 'primary' | 'warning' | 'danger' | 'gold' | 'muted';
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const tone = ICON_TONES[iconTone];
  const content = (
    <View style={[styles.listRow, !last && styles.listRowBorder]}>
      {tile ? (
        <View style={[styles.iconBox, { backgroundColor: tiles[tile.tone].bg }]}>
          <Icon name={tile.icon} size={21} color={tiles[tile.tone].fg} />
        </View>
      ) : icon ? (
        <View style={[styles.iconBox, { backgroundColor: tone.bg }]}>
          <Icon name={icon} size={20} color={tone.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.1 }} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 1 }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress && <Icon name="chevron-forward" size={18} color={colors.faint} />}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

/** Liste simgelerinin pastel kutuları (bento kutularıyla aynı aile) */
export const ICON_TONES = {
  get primary() {
    return { bg: colors.infoSoft, fg: colors.info };
  },
  get warning() {
    return { bg: colors.warningSoft, fg: colors.warning };
  },
  get danger() {
    return { bg: colors.dangerSoft, fg: colors.danger };
  },
  get gold() {
    return { bg: colors.goldSoft, fg: colors.gold };
  },
  get muted() {
    return { bg: colors.primarySoft, fg: colors.muted };
  },
};

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'success' | 'warning' | 'danger' | 'primary' }) {
  const t = { muted: [colors.primarySoft, colors.muted], success: [colors.successSoft, colors.success], warning: [colors.warningSoft, colors.warning], danger: [colors.dangerSoft, colors.danger], primary: [colors.infoSoft, colors.info] }[tone];
  return (
    <View style={{ backgroundColor: t[0], borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Text style={{ color: t[1], fontSize: 12, fontWeight: '700' }}>{children}</Text>
    </View>
  );
}

export function Empty({ icon = 'checkmark-circle-outline', title, text }: { icon?: IconName; title: string; text?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Icon name={icon} size={30} color={colors.faint} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>{title}</Text>
      {text && <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', maxWidth: 300 }}>{text}</Text>}
    </View>
  );
}

/** Belirsiz süreli ilerleme çubuğu: bir parça soldan sağa akar */
export function ProgressBar({ color = colors.ink, track = colors.border, width = 220 }: { color?: string; track?: string; width?: number }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [x]);
  const segment = width * 0.4;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Yükleniyor"
      style={{ width, height: 6, borderRadius: 3, backgroundColor: track, overflow: 'hidden' }}
    >
      <Animated.View
        style={{
          width: segment,
          height: '100%',
          borderRadius: 3,
          backgroundColor: color,
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-segment, width] }) }],
        }}
      />
    </View>
  );
}

/**
 * Veri yüklenirken: kısa yüklemelerde hiçbir şey görünmez (göz kırpması olmasın); uzarsa ekranın ortasında ince
 * ilerleme çubuğu belirir.
 */
export function Loading() {
  const [show, setShow] = useState(false);
  const [slow, setSlow] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      setShow(true);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }, 450);
    // Sunucu uykudan uyanıyorsa ilk yanıt yarım dakikayı bulabilir: kullanıcı neden beklediğini bilsin
    const s = setTimeout(() => setSlow(true), 6000);
    return () => {
      clearTimeout(t);
      clearTimeout(s);
    };
  }, [opacity]);
  return (
    <View style={{ flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', paddingBottom: 48 }}>
      {show && (
        <Animated.View style={{ opacity, alignItems: 'center', gap: 14 }}>
          <ProgressBar width={140} />
          {slow && (
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', maxWidth: 260 }}>
              Sunucu uyanıyor, ilk açılış biraz sürebilir…
            </Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Card tone="danger">
      <T color={colors.danger} weight="600">
        {errorText(error, 'Bir hata oluştu')}
      </T>
    </Card>
  );
}

/** Ortak stiller; tema değişince refreshStyles ile yeni renklerle yeniden kurulur */
const makeStyles = () =>
  StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, minHeight: 60 },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.9 },
  titleSmall: { fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 13.5, color: colors.faint, marginTop: 1, fontWeight: '500' },
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 12, flexGrow: 1 },
  footer: { backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  // Düz bento kutusu: beyaz zemin, ince sıcak kenarlık, gölgesiz
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 10 },
  cardWarning: { borderColor: colors.warningBorder, backgroundColor: colors.warningTint },
  cardDanger: { borderColor: colors.dangerBorder, backgroundColor: colors.card },
  cardPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: -2, paddingHorizontal: 4 },
  sectionTitleText: { fontSize: 17, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15, minHeight: 42, maxWidth: '100%', borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  choice: { padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, minHeight: 52, justifyContent: 'center' },
  choiceOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.primarySoft },
  segmented: { flexDirection: 'row', backgroundColor: colors.primarySoft, borderRadius: radius.pill, padding: 4 },
  segment: { flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.card },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 16, fontSize: 16, backgroundColor: colors.card, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, minHeight: 60 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  });

export const styles = makeStyles();
export function refreshStyles() {
  Object.assign(styles, makeStyles());
}

/**
 * Geri alınamayan işlemlerden önce onay: ortak alt sayfa penceresi (src/confirm.tsx).
 * Kısa kullanım: confirm(başlık, açıklama, düğme yazısı, kırmızı mı); ayrıntılı kullanım: confirm({ ... }).
 */
export function confirm(options: ConfirmOptions): Promise<boolean>;
export function confirm(title: string, message: string, ok?: string, destructive?: boolean): Promise<boolean>;
export function confirm(a: string | ConfirmOptions, message = '', ok?: string, destructive = true): Promise<boolean> {
  if (typeof a !== 'string') return openConfirm(a);
  return openConfirm({ title: a, message, confirmLabel: ok ?? (destructive ? 'Sil' : 'Evet'), tone: destructive ? 'danger' : 'neutral' });
}

/** Ad soyaddan iki harf (Ayşe Yılmaz → AY); ad yoksa okul adından */
export function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const pick = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return pick.toLocaleUpperCase('tr-TR');
}

// Beyaz baş harfler okunsun diye 600 tonları (açık ve koyu temada)
const AVATAR_COLORS = ['#4f46e5', '#0284c7', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#16a34a'];

/** Yuvarlak baş harf rozeti; rengi isimden türetilir, her kullanıcıda sabit kalır */
export function Avatar({ name, size = 44 }: { name?: string | null; size?: number }) {
  const key = (name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR_COLORS[key % AVATAR_COLORS.length], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

/**
 * Ana sayfaların başlığı (bütün rollerde aynı): solda baş harf rozeti, okul adı ve rol; sağda yuvarlak
 * düğmeler; altında iki satırlık büyük başlık (ikinci satır soluk).
 */
/**
 * Ana ekran başlığı (bütün roller): avatar, okul ve rol; altında vakte göre karşılama ile ad (kalın), onun altında tarih.
 * Yazılar ekranda az yer kaplasın diye orta boydadır.
 */
export function HomeHeader({ name, school, schoolType, role, children }: { name?: string | null; school?: string | null; schoolType?: string | null; role: string; children?: ReactNode }) {
  const now = new Date();
  const iso = localIso(now);
  const date = `${dayTitle(iso, { weekday: 'long' })}, ${dayTitle(iso, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const first = name?.trim().split(/\s+/)[0];
  return (
    <View style={{ gap: 14, paddingTop: 8 }}>
      <SpecialDayStrip />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={name} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {school ? (
            <Text style={{ fontSize: 13, color: colors.faint, fontWeight: '600' }} numberOfLines={1}>
              {shortSchoolName(school, schoolType)}
            </Text>
          ) : null}
          <Text style={{ fontSize: 16, color: colors.ink, fontWeight: '800', letterSpacing: -0.2 }} numberOfLines={1}>
            {role}
          </Text>
        </View>
        {children ? <View style={{ flexDirection: 'row', gap: 8 }}>{children}</View> : null}
      </View>
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, color: colors.ink }} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {greeting(now.getHours())}
          {first ? `, ${first}` : ''}
        </Text>
        <Text style={{ fontSize: 15.5, fontWeight: '600', color: colors.muted }} numberOfLines={1}>
          {date}
        </Text>
      </View>
    </View>
  );
}

/** Başlıktaki yuvarlak düğme (bildirim, menü); okunmamış varsa sayılı kırmızı rozet */
export function HeaderButton({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} yeni` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.primarySoft : colors.card,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Icon name={icon} size={21} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: -5,
            right: -5,
            minWidth: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
            borderWidth: 2,
            borderColor: colors.bg,
          }}
        >
          {/* Yazı tipinin üst / alt boşluğu sayıyı aşağı itmesin: satır yüksekliği sabit, dikey ortalama */}
          <Text style={{ color: '#fff', fontSize: 12, lineHeight: 14, fontWeight: '800', textAlign: 'center', includeFontPadding: false, textAlignVertical: 'center' }}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const BANNER_TILES = { gold: 'sun', warning: 'peach', primary: 'sky', danger: 'rose' } as const;

/** Renkli bilgi bandı (tatil, arife, uyarı): pastel zemin, solda dolu renkli simge kutusu */
export function Banner({ icon, title, text, tone = 'gold', right }: { icon: IconName; title: string; text?: string | null; tone?: 'gold' | 'warning' | 'primary' | 'danger'; right?: ReactNode }) {
  const t = tiles[BANNER_TILES[tone]];
  const iconBg = { gold: '#f59e0b', warning: '#f97316', primary: '#0284c7', danger: '#e11d48' }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.bg, borderRadius: radius.lg, padding: 16 }}>
      <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={24} color="#fff" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: t.fg, letterSpacing: -0.2 }}>{title}</Text>
        {text ? <Text style={{ fontSize: 13, fontWeight: '600', color: t.sub, marginTop: 2 }}>{text}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/**
 * Bento kutusu: renkli zemin, üstte simgeli küçük etiket, büyük rakam ve açıklama. Dokunulabiliyorsa sağ üstte
 * ok rozeti görünür. children rakamın altına eklenir (ör. pano listesi).
 */
export function Tile({
  tone = 'paper',
  icon,
  label,
  value,
  unit,
  caption,
  headline,
  onPress,
  children,
  style,
  big,
}: {
  tone?: TileTone;
  icon?: IconName;
  label: string;
  value?: string | number;
  unit?: string;
  caption?: string | null;
  /** Rakam yerine kısa büyük başlık (ör. sınıf adı, nöbet yeri) */
  headline?: string;
  onPress?: () => void;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
}) {
  const t = tiles[tone];
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: onPress ? 30 : 0 }}>
        {icon && <Icon name={icon} size={16} color={t.sub} />}
        <Text style={{ fontSize: 13, fontWeight: '700', color: t.sub, flexShrink: 1 }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {value != null && (
        <Text style={{ marginTop: 10, fontSize: big ? 46 : 38, lineHeight: big ? 50 : 42, fontWeight: '800', letterSpacing: -1.6, color: t.fg }} numberOfLines={1}>
          {value}
          {unit ? <Text style={{ fontSize: big ? 22 : 19, color: t.sub, letterSpacing: -0.5 }}>{unit}</Text> : null}
        </Text>
      )}
      {headline ? (
        <Text style={{ marginTop: 10, fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.8, color: t.fg }} numberOfLines={2}>
          {headline}
        </Text>
      ) : null}
      {caption ? (
        <Text style={{ marginTop: 4, fontSize: 13, fontWeight: '700', color: t.fg }} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
      {children}
      {onPress && (
        <View style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: 14, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrow-forward" size={15} color={t.fg} />
        </View>
      )}
    </>
  );
  const box: StyleProp<ViewStyle> = [
    { backgroundColor: t.bg, borderRadius: radius.xl, padding: 16, minHeight: 132, overflow: 'hidden' },
    tone === 'paper' && { borderWidth: 1, borderColor: colors.border },
    style,
  ];
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={[label, value, unit, headline, caption].filter((x) => x != null && x !== '').join(' ')} onPress={onPress} style={({ pressed }) => [box, { opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
      {body}
    </Pressable>
  ) : (
    <View style={box}>{body}</View>
  );
}

/** Bento satırı: kutuları eşit genişlikte yan yana dizer */
export function BentoRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }, style]}>{children}</View>;
}

/** Tatil günü: diğer kartlardan ayrılsın diye kendi renginde (lila), güneş simgeli */
export function HolidayCard({ label, name }: { label: string; name: string }) {
  const t = tiles.lilac;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.bg, borderRadius: radius.lg, padding: 16 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="sunny" size={22} color={t.fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: t.sub, letterSpacing: 0.3 }}>{label.toLocaleUpperCase('tr-TR')}</Text>
        <Text style={{ fontSize: 16, fontWeight: '800', color: t.fg }}>{name}</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: t.sub }}>Tatil · nöbet yok</Text>
      </View>
    </View>
  );
}

/** Aç/kapa anahtarı renkleri (bütün uygulamada): açık yeşil, kapalı kırmızı; koyu temada biraz daha yumuşak tonlar */
export function switchColors() {
  const on = dark ? '#22a55a' : '#16a34a';
  const off = dark ? '#c53030' : '#dc2626';
  return { trackColor: { true: on, false: off }, thumbColor: '#ffffff', ios_backgroundColor: off };
}
