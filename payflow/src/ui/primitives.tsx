import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Category, categoryColors } from '../core/categories';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, radius } from '../theme/tokens';
import { AnyIconKey, Icon } from './icons';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'money';

const variantStyle: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.display, fontSize: 36, letterSpacing: -1 },
  title: { fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.bodyBold, fontSize: 16 },
  body: { fontFamily: fonts.body, fontSize: 15 },
  bodyStrong: { fontFamily: fonts.bodyMedium, fontSize: 15 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  caption: { fontFamily: fonts.body, fontSize: 12 },
  money: { fontFamily: fonts.display, fontSize: 15, fontVariant: ['tabular-nums'] },
};

export function AppText({
  variant = 'body',
  muted,
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const { palette } = useTheme();
  return (
    <Text
      {...rest}
      style={[variantStyle[variant], { color: color ?? (muted ? palette.muted : palette.text) }, style]}
    />
  );
}

export function Surface({
  children,
  style,
  tone = 'surface',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'surface2';
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: tone === 'surface' ? palette.surface : palette.surface2,
          borderColor: palette.line,
          borderWidth: tone === 'surface' ? StyleSheet.hairlineWidth * 2 : 0,
          borderRadius: radius.xl,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  badge,
}: {
  icon: AnyIconKey;
  label: string;
  onPress?: () => void;
  badge?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radius.md,
        backgroundColor: palette.surface,
        borderColor: palette.line,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={20} color={palette.text} />
      {badge ? (
        <View style={{ position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: palette.warn }} />
      ) : null}
    </Pressable>
  );
}

export function PrimaryButton({ title, onPress }: { title: string; onPress?: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        height: 54,
        borderRadius: 16,
        backgroundColor: palette.button,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <AppText variant="heading" color={palette.onButton}>
        {title}
      </AppText>
    </Pressable>
  );
}

/** Kategori ikon karesi (squircle): renkli ikon + yarı saydam zemin. */
export function CategoryBadge({ category, size = 42 }: { category: Category; size?: number }) {
  const { isDark } = useTheme();
  const c = categoryColors(category, isDark);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        backgroundColor: c.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={category.icon} size={size / 2} color={c.fg} strokeWidth={1.9} />
    </View>
  );
}

/** Halka skor göstergesi (Ödeme Sağlığı). */
export function ScoreRing({ score, size = 48, stroke = 5 }: { score: number; size?: number; stroke?: number }) {
  const { palette } = useTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Ödeme sağlığı ${clamped} / 100`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={palette.surface2} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={palette.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * clamped) / 100} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <AppText variant="money" style={{ fontSize: size * 0.3 }}>
        {clamped}
      </AppText>
    </View>
  );
}

/** Küçük durum etiketi (ör. "≈ tahmini", "2 gün"). */
export function Chip({ text, color, background }: { text: string; color: string; background: string }) {
  return (
    <View style={{ backgroundColor: background, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <AppText variant="caption" color={color} style={{ fontFamily: fonts.bodyBold, fontSize: 11 }}>
        {text}
      </AppText>
    </View>
  );
}
