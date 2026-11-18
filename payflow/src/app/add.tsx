import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BillForm } from '../features/BillForm';
import { ExpenseForm } from '../features/ExpenseForm';
import { useTheme } from '../theme/ThemeProvider';
import { Segmented } from '../ui/form';
import { AppText, IconButton } from '../ui/primitives';

type Tab = 'card' | 'bill' | 'daily';

/** Hızlı ekle: Kart harcaması / Fatura / Günlük harcama. */
export default function AddScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'card' || params.tab === 'bill' ? params.tab : 'daily');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, paddingHorizontal: 20, gap: 16 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="close" label="Kapat" onPress={() => router.back()} />
          <AppText variant="heading" accessibilityRole="header">
            Yeni kayıt
          </AppText>
          <View style={{ width: 44 }} />
        </View>
        <Segmented
          label="Kayıt türü"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'card', label: 'Kart' },
            { value: 'bill', label: 'Fatura' },
            { value: 'daily', label: 'Günlük' },
          ]}
        />
        {tab === 'bill' ? <BillForm /> : <ExpenseForm key={tab} mode={tab} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
