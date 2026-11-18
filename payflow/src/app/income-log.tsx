import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthName, periodKey } from '../core/dates';
import { expectedIncome, incomeSources } from '../core/income';
import { formatTL, toLira } from '../core/money';
import { parseAmount } from '../core/parse';
import { useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { TextField } from '../ui/form';
import { AppText, IconButton, PrimaryButton, Surface } from '../ui/primitives';

/** Değişken gelirin o ay gerçekten yatan net tutarını kaydet (ek ders vb.). */
export default function IncomeLogScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const params = useLocalSearchParams<{ id?: string; period?: string }>();
  const src = incomeSources(state.settings).find((i) => i.id === params.id);
  const period = params.period ?? periodKey(new Date());
  const exp = useMemo(() => (src ? expectedIncome(src, state.settings, period) : null), [src, state.settings, period]);
  const [text, setText] = useState(exp?.actual ? toLira(exp.amount).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '');
  const [error, setError] = useState<string | null>(null);

  if (!src || !exp) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, padding: 20, paddingTop: insets.top + 12 }}>
        <IconButton icon="close" label="Kapat" onPress={() => router.back()} />
      </View>
    );
  }
  const [y, m] = period.split('-').map(Number);
  const label = `${monthName(new Date(y, m - 1, 1))} ${y}`;

  const save = () => {
    const amount = parseAmount(text);
    if (amount === null || amount <= 0) return setError('Yatan net tutarı gir (ör. 6.250,40)');
    dispatch({ type: 'income/log', id: src.id, period, amount });
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="close" label="Kapat" onPress={() => router.back()} />
          <AppText variant="heading" accessibilityRole="header">
            {src.name} · {label}
          </AppText>
          <View style={{ width: 44 }} />
        </View>
        <Surface style={{ padding: 16, gap: 4 }}>
          <AppText variant="label" muted>
            {exp.actual ? 'Kaydedilen tutar' : exp.estimated ? 'Tahmin (önceki ayların ortalaması)' : 'Beklenen tutar'}
          </AppText>
          <AppText variant="title">{formatTL(exp.amount)}</AppText>
        </Surface>
        <TextField label="Bu ay yatan net tutar (₺)" placeholder="6.250,40" value={text} onChangeText={(t) => { setText(t); setError(null); }} keyboardType="decimal-pad" error={error} autoFocus />
        <PrimaryButton title="Kaydet" onPress={save} />
        {exp.actual ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              dispatch({ type: 'income/log', id: src.id, period, amount: null });
              router.back();
            }}
            style={{ alignSelf: 'center', padding: 10 }}
          >
            <AppText variant="label" color={palette.danger}>
              Kaydı sil
            </AppText>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
