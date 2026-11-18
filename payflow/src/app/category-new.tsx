import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createCustomCategory, EntryKind, IconKey, STUDIO_COLORS } from '../core/categories';
import { useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/tokens';
import { Segmented, SectionLabel, TextField } from '../ui/form';
import { Icon } from '../ui/icons';
import { AppText, IconButton, PrimaryButton, Surface } from '../ui/primitives';

const STUDIO_ICONS: { key: IconKey; label: string }[] = [
  { key: 'paw', label: 'Evcil' }, { key: 'heart', label: 'Sağlık' }, { key: 'book', label: 'Eğitim' },
  { key: 'plane', label: 'Seyahat' }, { key: 'dumbbell', label: 'Spor' }, { key: 'music', label: 'Müzik' },
  { key: 'gift', label: 'Hediye' }, { key: 'coffee', label: 'Kafe' }, { key: 'cart', label: 'Market' },
  { key: 'car', label: 'Araba' }, { key: 'bus', label: 'Ulaşım' }, { key: 'fuel', label: 'Akaryakıt' },
  { key: 'rent', label: 'Ev' }, { key: 'bolt', label: 'Enerji' }, { key: 'drop', label: 'Su' },
  { key: 'wifi', label: 'İnternet' }, { key: 'phone', label: 'Telefon' }, { key: 'tv', label: 'Ekran' },
  { key: 'shield', label: 'Sigorta' }, { key: 'smile', label: 'Çocuk' }, { key: 'game', label: 'Oyun' },
  { key: 'shirt', label: 'Giyim' }, { key: 'wrench', label: 'Tamir' }, { key: 'leaf', label: 'Bahçe' },
];

/** Kategori Stüdyosu: ad + renk + ikon, canlı önizlemeyle. */
export default function CategoryNewScreen() {
  const { palette, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { dispatch } = useStore();
  const params = useLocalSearchParams<{ kind?: EntryKind }>();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<EntryKind>(params.kind === 'bill' ? 'bill' : 'daily');
  const [colorIndex, setColorIndex] = useState(9);
  const [icon, setIcon] = useState<IconKey>('paw');
  const [error, setError] = useState<string | null>(null);

  const sw = STUDIO_COLORS[colorIndex];
  const fg = isDark ? sw.color : sw.colorLight;
  const bg = withAlpha(sw.color, isDark ? 0.16 : 0.24);

  const save = () => {
    if (!name.trim()) return setError('Kategoriye bir ad ver');
    dispatch({ type: 'category/add', category: createCustomCategory({ name, kind, icon, colorIndex }) });
    router.back();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, paddingHorizontal: 20, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="back" label="Geri" onPress={() => router.back()} />
        <AppText variant="heading" accessibilityRole="header">
          Kategori Stüdyosu
        </AppText>
        <View style={{ width: 44 }} />
      </View>

      <Surface tone="surface2" style={{ padding: 14, gap: 8 }}>
        <SectionLabel>CANLI ÖNİZLEME</SectionLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderRadius: 16, padding: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={24} color={fg} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{name.trim() || 'Kategori adı'}</AppText>
            <AppText variant="caption" muted>
              {kind === 'bill' ? 'Fatura türü' : 'Günlük harcama'}
            </AppText>
          </View>
        </View>
      </Surface>

      <TextField label="Kategori adı" placeholder="Evcil Dostum" value={name} onChangeText={(t) => { setName(t); setError(null); }} error={error} />
      <Segmented label="Tür" value={kind === 'bill' ? 'bill' : 'daily'} onChange={(v) => setKind(v)} options={[{ value: 'daily', label: 'Günlük harcama' }, { value: 'bill', label: 'Fatura' }]} />

      <SectionLabel>RENK</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel="Renk">
        {STUDIO_COLORS.map((c, i) => (
          <Pressable
            key={c.name}
            accessibilityRole="radio"
            accessibilityLabel={c.name}
            accessibilityState={{ selected: i === colorIndex }}
            onPress={() => setColorIndex(i)}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.color, borderWidth: 3, borderColor: i === colorIndex ? palette.text : 'transparent' }}
          />
        ))}
      </View>

      <SectionLabel>İKON</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }} accessibilityRole="radiogroup" accessibilityLabel="İkon">
        {STUDIO_ICONS.map((it) => {
          const on = it.key === icon;
          return (
            <View key={it.key} style={{ width: '16.66%', padding: 4 }}>
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={it.label}
                accessibilityState={{ selected: on }}
                onPress={() => setIcon(it.key)}
                style={{ height: 48, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? fg : palette.line, backgroundColor: on ? bg : palette.surface, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name={it.key} size={21} color={on ? fg : palette.muted} />
              </Pressable>
            </View>
          );
        })}
      </View>

      <PrimaryButton title="Kategoriyi oluştur" onPress={save} />
    </ScrollView>
  );
}
