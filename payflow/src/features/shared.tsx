import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Category, categoryColors, EntryKind } from '../core/categories';
import { ReminderOffset, ReminderSettings } from '../core/reminders';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { ChoiceChip, SectionLabel, Stepper } from '../ui/form';
import { Icon } from '../ui/icons';
import { AppText } from '../ui/primitives';

/** Kategori ızgarası: seçili olan çerçeveli; son kutu "Yeni" → Kategori Stüdyosu. */
export function CategoryGrid({
  categories,
  value,
  onChange,
  kind,
  columns = 4,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  kind: EntryKind;
  columns?: number;
}) {
  const { palette, isDark } = useTheme();
  const width = `${100 / columns}%` as const;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
      {categories.map((c) => {
        const on = c.id === value;
        const col = categoryColors(c, isDark);
        return (
          <View key={c.id} style={{ width, padding: 4 }}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={c.name}
              onPress={() => onChange(c.id)}
              style={{
                height: 74,
                borderRadius: 16,
                borderWidth: on ? 2 : 1,
                borderColor: on ? col.fg : palette.line,
                backgroundColor: on ? col.bg : palette.surface,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: col.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={c.icon} size={17} color={col.fg} strokeWidth={1.9} />
              </View>
              <AppText variant="caption" numberOfLines={1} style={{ fontFamily: fonts.bodyMedium, fontSize: 11, paddingHorizontal: 2 }}>
                {c.name}
              </AppText>
            </Pressable>
          </View>
        );
      })}
      <View style={{ width, padding: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Yeni kategori oluştur"
          onPress={() => router.push({ pathname: '/category-new', params: { kind } })}
          style={{ height: 74, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.line, alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Icon name="plus" size={20} color={palette.accent} strokeWidth={2.2} />
          <AppText variant="caption" color={palette.accent} style={{ fontFamily: fonts.bodyMedium, fontSize: 11 }}>
            Yeni
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const OFFSETS: { value: ReminderOffset; label: string }[] = [
  { value: 'D-3', label: '3 gün önce' },
  { value: 'D-1', label: '1 gün önce' },
  { value: 'D0', label: 'Son gün' },
];

const pad = (n: number) => String(n).padStart(2, '0');

export function ReminderPicker({ value, onChange }: { value: ReminderSettings; onChange: (v: ReminderSettings) => void }) {
  const toggle = (o: ReminderOffset) =>
    onChange({ ...value, offsets: value.offsets.includes(o) ? value.offsets.filter((x) => x !== o) : [...value.offsets, o] });
  return (
    <View style={{ gap: 10 }}>
      <SectionLabel>HATIRLAT</SectionLabel>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {OFFSETS.map((o) => (
          <ChoiceChip key={o.value} label={o.label} tone="warn" selected={value.offsets.includes(o.value)} onPress={() => toggle(o.value)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Stepper label="Saat" value={value.hour} min={0} max={23} onChange={(hour) => onChange({ ...value, hour })} format={pad} />
        </View>
        <View style={{ flex: 1 }}>
          <Stepper label="Dakika" value={value.minute} min={0} max={45} step={15} onChange={(minute) => onChange({ ...value, minute })} format={pad} />
        </View>
      </View>
      {value.offsets.length === 0 ? (
        <AppText variant="caption" muted>
          Hatırlatma kapalı. Bu ödeme için bildirim gelmez.
        </AppText>
      ) : null}
    </View>
  );
}
