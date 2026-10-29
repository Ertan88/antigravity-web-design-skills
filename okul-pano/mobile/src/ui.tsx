import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Text, TextInput } from './text.tsx';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space, tiles, type TileTone } from './theme.ts';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} accessibilityElementsHidden importantForAccessibility="no" />;
}

/**
 * Ekran iskeleti: güvenli alan, başlık (geri düğmesi isteğe bağlı), kaydırılabilir gövde ve
 * altta sabit düğme alanı. Aşağı çekince yenilenir.
 */
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
  const bg = tone === 'danger' ? '#fff5f6' : colors.bg;
  const body = <View style={styles.body}>{children}</View>;
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
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {footer && <SafeAreaView edges={['bottom']} style={styles.footer}>{footer}</SafeAreaView>}
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

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';

export function Button({
  children,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  size = 'md',
  style,
}: {
  children: ReactNode;
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
      <Text style={{ color: v.fg, fontSize: size === 'sm' ? 14 : 15.5, fontWeight: '700' }}>{children}</Text>
    </Pressable>
  );
}

const BUTTONS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
  secondary: { bg: '#fff', fg: colors.ink, border: colors.borderStrong },
  danger: { bg: colors.danger, fg: '#fff', border: colors.danger },
  success: { bg: colors.success, fg: '#fff', border: colors.success },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

/** Seçilebilir küçük düğme (şablon, süre, görünüm seçimi) */
export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {icon && <Icon name={icon} size={16} color={selected ? '#fff' : colors.ink} />}
      <Text style={{ flexShrink: 1, fontSize: 14, fontWeight: selected ? '700' : '600', color: selected ? '#fff' : colors.ink }} numberOfLines={1}>
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
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.subtle}
        {...input}
        style={[styles.input, input.multiline && { height: undefined, minHeight: 92, paddingTop: 12, textAlignVertical: 'top' }, error ? { borderColor: colors.danger } : null, input.style]}
      />
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
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.success, false: colors.borderStrong }} thumbColor="#fff" accessibilityLabel={label} />
    </View>
  );
}

/** Dokunulabilir liste satırı (sağda ok) */
export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = 'primary',
  right,
  onPress,
  last,
}: {
  title: string;
  subtitle?: string | null;
  icon?: IconName;
  iconTone?: 'primary' | 'warning' | 'danger' | 'gold' | 'muted';
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const tone = ICON_TONES[iconTone];
  const content = (
    <View style={[styles.listRow, !last && styles.listRowBorder]}>
      {icon && (
        <View style={[styles.iconBox, { backgroundColor: tone.bg }]}>
          <Icon name={icon} size={20} color={tone.fg} />
        </View>
      )}
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
  primary: { bg: '#e0f2fe', fg: '#0369a1' },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  gold: { bg: colors.goldSoft, fg: colors.gold },
  muted: { bg: colors.primarySoft, fg: colors.muted },
} as const;

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'success' | 'warning' | 'danger' | 'primary' }) {
  const t = { muted: [colors.primarySoft, colors.muted], success: [colors.successSoft, colors.success], warning: [colors.warningSoft, '#9a3412'], danger: [colors.dangerSoft, colors.danger], primary: ['#e0f2fe', '#0369a1'] }[tone];
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

/** Veri yüklenirken: yuvarlak simge yerine ince ilerleme çubuğu */
export function Loading() {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center' }}>
      <ProgressBar />
    </View>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Card tone="danger">
      <T color={colors.danger} weight="600">
        {error instanceof Error ? error.message : 'Bir hata oluştu'}
      </T>
    </Card>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, minHeight: 60 },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.9 },
  titleSmall: { fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 13.5, color: colors.faint, marginTop: 1, fontWeight: '500' },
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  // Düz bento kutusu: beyaz zemin, ince sıcak kenarlık, gölgesiz
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 10 },
  cardWarning: { borderColor: colors.warningBorder, backgroundColor: '#fffaf5' },
  cardDanger: { borderColor: '#fecdd3', backgroundColor: '#fff' },
  cardPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: -2, paddingHorizontal: 4 },
  sectionTitleText: { fontSize: 17, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15, minHeight: 42, maxWidth: '100%', borderRadius: radius.pill, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  choice: { padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', minHeight: 52, justifyContent: 'center' },
  choiceOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.primarySoft },
  segmented: { flexDirection: 'row', backgroundColor: '#ece9e3', borderRadius: radius.pill, padding: 4 },
  segment: { flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: '#fff' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, minHeight: 60 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

/** Geri alınamayan işlemlerden önce onay (web'de tarayıcının onay penceresi) */
export function confirm(title: string, message: string, ok = 'Evet', destructive = true): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

/** Ad soyaddan iki harf (Ayşe Yılmaz → AY); ad yoksa okul adından */
export function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const pick = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return pick.toLocaleUpperCase('tr-TR');
}

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e'];

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
export function HomeHeader({
  name,
  school,
  role,
  title,
  titleMuted,
  children,
}: {
  name?: string | null;
  school?: string | null;
  role: string;
  title: string;
  titleMuted?: string | null;
  children?: ReactNode;
}) {
  return (
    <View style={{ gap: 18, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={name} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {school ? (
            <Text style={{ fontSize: 13, color: colors.faint, fontWeight: '600' }} numberOfLines={1}>
              {school}
            </Text>
          ) : null}
          <Text style={{ fontSize: 16, color: colors.ink, fontWeight: '800', letterSpacing: -0.2 }} numberOfLines={1}>
            {role}
          </Text>
        </View>
        {children ? <View style={{ flexDirection: 'row', gap: 8 }}>{children}</View> : null}
      </View>
      <Text style={{ fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1.2, color: colors.ink }} accessibilityRole="header">
        {title}
        {titleMuted ? <Text style={{ color: colors.subtle }}>{`\n${titleMuted}`}</Text> : null}
      </Text>
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
        backgroundColor: pressed ? colors.primarySoft : '#fff',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Icon name={icon} size={21} />
      {badge ? (
        <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: colors.bg }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text>
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
