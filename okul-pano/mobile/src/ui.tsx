import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space } from './theme.ts';

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
  const bg = tone === 'danger' ? '#fff7f7' : colors.bg;
  const body = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bg }]} edges={['top', 'left', 'right']}>
      {(title || back) && (
        <View style={styles.header}>
          {back && (
            <Pressable accessibilityRole="button" accessibilityLabel="Geri" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.iconButton}>
              <Icon name="chevron-back" size={24} />
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
  const h = size === 'sm' ? 40 : size === 'lg' ? 56 : 50;
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
      <Text style={{ color: v.fg, fontSize: size === 'sm' ? 14 : 16, fontWeight: '700' }}>{children}</Text>
    </Pressable>
  );
}

const BUTTONS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
  secondary: { bg: '#fff', fg: colors.ink, border: '#dbe3e8' },
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
      {icon && <Icon name={icon} size={16} color={selected ? '#fff' : colors.primary} />}
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
        placeholderTextColor="#94a3b8"
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
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: '#cbd5dc' }} thumbColor="#fff" accessibilityLabel={label} />
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
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }} numberOfLines={2}>
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

export const ICON_TONES = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  gold: { bg: colors.goldSoft, fg: colors.gold },
  muted: { bg: '#eef2f5', fg: colors.muted },
} as const;

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'success' | 'warning' | 'danger' | 'primary' }) {
  const t = { muted: ['#eef2f5', colors.muted], success: [colors.successSoft, colors.success], warning: [colors.warningSoft, '#9a3412'], danger: [colors.dangerSoft, colors.danger], primary: [colors.primarySoft, colors.primary] }[tone];
  return (
    <View style={{ backgroundColor: t[0], borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Text style={{ color: t[1], fontSize: 12, fontWeight: '700' }}>{children}</Text>
    </View>
  );
}

export function Empty({ icon = 'checkmark-circle-outline', title, text }: { icon?: IconName; title: string; text?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
      <Icon name={icon} size={36} color={colors.faint} />
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>{title}</Text>
      {text && <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', maxWidth: 300 }}>{text}</Text>}
    </View>
  );
}

/** Belirsiz süreli ilerleme çubuğu: bir parça soldan sağa akar */
export function ProgressBar({ color = colors.primary, track = colors.primarySoft, width = 220 }: { color?: string; track?: string; width?: number }) {
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, minHeight: 56 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  titleSmall: { fontSize: 18, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 1 },
  body: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },
  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  // Hafif derinlik: kenarlık + yumuşak gölge (Android'de düşük yükselti)
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardWarning: { borderColor: colors.warningBorder, borderWidth: 1.5 },
  cardDanger: { borderColor: '#ecc8c8', backgroundColor: '#fff' },
  cardPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: -2, paddingHorizontal: 2 },
  sectionTitleText: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.1 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, maxWidth: '100%', borderRadius: radius.pill, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe3e8' },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  choice: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: '#dbe3e8', backgroundColor: '#fff', minHeight: 48, justifyContent: 'center' },
  choiceOn: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  segmented: { flexDirection: 'row', backgroundColor: '#e4eaee', borderRadius: 12, padding: 4 },
  segment: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: '#fff' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  input: { height: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 56 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: '#eef2f5' },
  iconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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

/**
 * Ana sayfaların başlığı (bütün rollerde aynı): küçük rol etiketi, büyük başlık, alt satır (en çok iki satır, kesilmez)
 * ve sağda yuvarlatılmış kare düğmeler.
 */
export function HomeHeader({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle?: string | null; children?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 10, paddingBottom: 2 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.9, color: colors.primaryDark }} numberOfLines={1}>
          {eyebrow.toLocaleUpperCase('tr-TR')}
        </Text>
        <Text style={{ fontSize: 27, fontWeight: '800', letterSpacing: -0.5, color: colors.ink }} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 19 }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children ? <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>{children}</View> : null}
    </View>
  );
}

/** Başlıktaki yuvarlatılmış kare düğme (bildirim, menü) */
export function HeaderButton({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} yeni` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.primarySoft : '#fff',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Icon name={icon} size={22} />
      {badge ? (
        <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: colors.bg }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Renkli bilgi bandı (tatil, arife, uyarı): solda simge kutusu, başlık ve açıklama */
export function Banner({ icon, title, text, tone = 'gold', right }: { icon: IconName; title: string; text?: string | null; tone?: 'gold' | 'warning' | 'primary' | 'danger'; right?: ReactNode }) {
  const t = {
    gold: { bg: colors.goldSoft, border: '#f1dfae', fg: colors.gold },
    warning: { bg: colors.warningSoft, border: colors.warningBorder, fg: colors.warning },
    primary: { bg: colors.primarySoft, border: '#cfe3ea', fg: colors.primary },
    danger: { bg: colors.dangerSoft, border: '#f2c4c4', fg: colors.danger },
  }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.bg, borderColor: t.border, borderWidth: 1, borderRadius: radius.lg, padding: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#ffffffaa', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={21} color={t.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{title}</Text>
        {text ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: 1 }}>{text}</Text> : null}
      </View>
      {right}
    </View>
  );
}
