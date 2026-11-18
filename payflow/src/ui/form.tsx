import { ReactNode } from 'react';
import { Pressable, StyleProp, Switch, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, radius } from '../theme/tokens';
import { AppText } from './primitives';

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <AppText variant="caption" muted style={{ fontFamily: fonts.bodyBold, letterSpacing: 0.4 }}>
      {children}
    </AppText>
  );
}

export function TextField({
  label,
  hint,
  error,
  style,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string | null; style?: StyleProp<ViewStyle> }) {
  const { palette } = useTheme();
  return (
    <View style={[{ gap: 6 }, style]}>
      <AppText variant="label" muted>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        {...input}
        style={{
          height: 50,
          borderRadius: radius.md,
          borderWidth: error ? 1.5 : 1,
          borderColor: error ? palette.danger : palette.line,
          backgroundColor: palette.surface,
          color: palette.text,
          paddingHorizontal: 14,
          fontFamily: fonts.bodyMedium,
          fontSize: 15,
        }}
      />
      {error ? (
        <AppText variant="caption" color={palette.danger}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: 4, backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: 16, padding: 4 }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: on ? palette.button : 'transparent', alignItems: 'center', justifyContent: 'center' }}
          >
            <AppText variant="label" color={on ? palette.onButton : palette.muted} style={{ fontFamily: fonts.bodyBold }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChoiceChip({
  label,
  selected,
  onPress,
  tone = 'accent',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tone?: 'accent' | 'warn';
}) {
  const { palette } = useTheme();
  const fg = tone === 'warn' ? palette.warn : palette.accent;
  const bg = tone === 'warn' ? palette.warnBg : palette.surface2;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? fg : palette.line,
        backgroundColor: selected ? bg : palette.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText variant="label" color={selected ? (tone === 'warn' ? fg : palette.text) : palette.muted}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Sayı seçici: −  değer  +  (gün, saat gibi küçük aralıklar için). */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const { palette } = useTheme();
  const wrap = (v: number) => (v > max ? min : v < min ? max : v);
  const btn = (sign: 1 | -1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${sign > 0 ? 'artır' : 'azalt'}`}
      onPress={() => onChange(wrap(value + sign * step))}
      style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}
    >
      <AppText variant="title" style={{ fontSize: 20 }}>
        {sign > 0 ? '+' : '−'}
      </AppText>
    </Pressable>
  );
  return (
    <View
      accessible={false}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radius.lg, padding: 6, paddingLeft: 14 }}
    >
      <AppText variant="body" muted numberOfLines={2} style={{ flex: 1, flexShrink: 1, minWidth: 0, paddingRight: 8 }}>
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {btn(-1)}
        <AppText variant="money" style={{ minWidth: 58, textAlign: 'center', fontSize: 17 }} accessibilityLabel={`${label}: ${format(value)}`}>
          {format(value)}
        </AppText>
        {btn(1)}
      </View>
    </View>
  );
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  left,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  left?: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: radius.lg, padding: 12, paddingHorizontal: 14 }}>
      {left}
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" muted>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: palette.button, false: palette.surface2 }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];

export function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 }}>
      {KEYS.map((k) => (
        <Pressable
          key={k}
          accessibilityRole="button"
          accessibilityLabel={k === '⌫' ? 'Sil' : k === ',' ? 'Virgül' : k}
          onPress={() => onKey(k)}
          style={({ pressed }) => ({ width: '33.33%', height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, opacity: pressed ? 0.5 : 1 })}
        >
          <AppText variant="title" style={{ fontSize: 22 }}>
            {k}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

export function FormScroll({ children }: { children: ReactNode }) {
  return <View style={{ gap: 16 }}>{children}</View>;
}
