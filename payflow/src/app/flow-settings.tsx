import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTL, toLira } from '../core/money';
import { parseAmount } from '../core/parse';
import { fromDrafts, IncomeDraft, IncomeEditor, toDrafts } from '../features/IncomeEditor';
import { useStore } from '../store/StoreProvider';
import { currentBalance } from '../store/timeline';
import { useTheme } from '../theme/ThemeProvider';
import { SectionLabel, TextField } from '../ui/form';
import { AppText, IconButton, PrimaryButton } from '../ui/primitives';

const asInput = (k?: number | null) => (k ? toLira(k).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

/** Zaman Nehri ayarları: güncel hesap bakiyesi ve gelir kaynakları. */
export default function FlowSettingsScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const s = state.settings;

  const [balanceText, setBalanceText] = useState(asInput(currentBalance(state)));
  const [incomes, setIncomes] = useState<IncomeDraft[]>(toDrafts(s.incomes ?? []));
  const [errors, setErrors] = useState<{ balance?: string; incomes?: string }>({});

  const save = () => {
    const negative = balanceText.trim().startsWith('-');
    const bal = parseAmount(balanceText.replace(/^-/, ''));
    const parsed = fromDrafts(incomes);
    const e = { balance: balanceText && bal === null ? 'Geçerli bir tutar gir' : undefined, incomes: parsed.error ?? undefined };
    setErrors(e);
    if (e.balance || e.incomes) return;
    dispatch({
      type: 'settings/update',
      settings: {
        balance: bal === null ? undefined : { amount: negative ? -bal : bal, asOf: new Date().toISOString() },
        incomes: parsed.incomes,
        salaryDay: undefined,
        salaryAmount: undefined,
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
            Bakiye ve gelirler
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
          hint="Bundan sonra girdiğin nakit/banka kartı harcamaları, kart ödemeleri ve yatan gelirler otomatik hesaba katılır."
        />
        {s.balance ? (
          <AppText variant="caption" muted>
            Son girilen: {formatTL(s.balance.amount)} · {new Date(s.balance.asOf).toLocaleDateString('tr-TR')}
          </AppText>
        ) : null}
        <SectionLabel>GELİRLER</SectionLabel>
        <IncomeEditor value={incomes} onChange={(v) => { setIncomes(v); setErrors((x) => ({ ...x, incomes: undefined })); }} />
        {errors.incomes ? (
          <AppText variant="caption" color={palette.danger}>
            {errors.incomes}
          </AppText>
        ) : null}
        <PrimaryButton title="Kaydet" onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
