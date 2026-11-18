import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTL, toLira } from '../core/money';
import { parseAmount } from '../core/parse';
import { useStore } from '../store/StoreProvider';
import { currentBalance } from '../store/timeline';
import { useTheme } from '../theme/ThemeProvider';
import { Stepper, TextField, ToggleRow } from '../ui/form';
import { AppText, IconButton, PrimaryButton } from '../ui/primitives';

const asInput = (k?: number | null) => (k ? toLira(k).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

/** Zaman Nehri ayarları: güncel hesap bakiyesi, maaş günü ve tutarı. */
export default function FlowSettingsScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const s = state.settings;

  const [balanceText, setBalanceText] = useState(asInput(currentBalance(state)));
  const [hasSalary, setHasSalary] = useState(!!s.salaryDay);
  const [salaryDay, setSalaryDay] = useState(s.salaryDay ?? 15);
  const [salaryText, setSalaryText] = useState(asInput(s.salaryAmount));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = () => {
    const e: Record<string, string> = {};
    const negative = balanceText.trim().startsWith('-');
    const bal = parseAmount(balanceText.replace(/^-/, ''));
    if (balanceText && bal === null) e.balance = 'Geçerli bir tutar gir';
    const salary = parseAmount(salaryText);
    if (hasSalary && (salary === null || salary <= 0)) e.salary = 'Maaş tutarını gir';
    setErrors(e);
    if (Object.keys(e).length) return;
    dispatch({
      type: 'settings/update',
      settings: {
        balance: bal === null ? undefined : { amount: negative ? -bal : bal, asOf: new Date().toISOString() },
        salaryDay: hasSalary ? salaryDay : undefined,
        salaryAmount: hasSalary ? salary ?? undefined : undefined,
      },
    });
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="close" label="Kapat" onPress={() => router.back()} />
          <AppText variant="heading" accessibilityRole="header">
            Bakiye ve maaş
          </AppText>
          <View style={{ width: 44 }} />
        </View>
        <TextField
          label="Şu anki hesap bakiyen (₺)"
          placeholder="31.480"
          value={balanceText}
          onChangeText={setBalanceText}
          keyboardType="numbers-and-punctuation"
          error={errors.balance}
          hint="Bundan sonra girdiğin nakit/banka kartı harcamaları ve kart ödemeleri otomatik düşülür."
        />
        <ToggleRow title="Düzenli maaşım var" value={hasSalary} onChange={setHasSalary} />
        {hasSalary ? (
          <>
            <Stepper label="Maaş günü" value={salaryDay} min={1} max={31} onChange={setSalaryDay} />
            <TextField label="Net maaş (₺)" placeholder="52.000" value={salaryText} onChangeText={setSalaryText} keyboardType="decimal-pad" error={errors.salary} />
          </>
        ) : null}
        {s.balance ? (
          <AppText variant="caption" muted>
            Son girilen: {formatTL(s.balance.amount)} · {new Date(s.balance.asOf).toLocaleDateString('tr-TR')}
          </AppText>
        ) : null}
        <PrimaryButton title="Kaydet" onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
