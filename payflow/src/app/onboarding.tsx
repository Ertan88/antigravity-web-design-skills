import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseAmount } from '../core/parse';
import { ReminderSettings } from '../core/reminders';
import { ReminderPicker } from '../features/shared';
import { useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { Stepper, TextField, ToggleRow } from '../ui/form';
import { AppText, PrimaryButton } from '../ui/primitives';

/** İlk kurulum: maaş günü/tutarı ve varsayılan hatırlatma; ardından istersen ilk kart. */
export default function OnboardingScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const [hasSalary, setHasSalary] = useState(true);
  const [salaryDay, setSalaryDay] = useState(state.settings.salaryDay ?? 15);
  const [salaryText, setSalaryText] = useState('');
  const [reminders, setReminders] = useState<ReminderSettings>(state.settings.defaultReminders);
  const [addCard, setAddCard] = useState(true);

  const finish = (skip = false) => {
    const salary = parseAmount(salaryText);
    dispatch({
      type: 'settings/update',
      settings: skip
        ? { onboardingDone: true }
        : {
            onboardingDone: true,
            defaultReminders: reminders,
            salaryDay: hasSalary ? salaryDay : undefined,
            salaryAmount: hasSalary && salary ? salary : undefined,
          },
    });
    router.replace('/');
    if (!skip && addCard) router.push('/card-new');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 6, width: 120 }} accessible accessibilityLabel="Adım 2 / 3">
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < 2 ? palette.accent : palette.surface2 }} />
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => finish(true)} hitSlop={8}>
          <AppText variant="label" muted>
            Şimdilik atla
          </AppText>
        </Pressable>
      </View>

      <View style={{ gap: 6 }}>
        <AppText variant="caption" color={palette.accent} style={{ fontFamily: fonts.bodyBold, letterSpacing: 0.6 }}>
          ADIM 2 / 3
        </AppText>
        <AppText variant="display" accessibilityRole="header" style={{ fontSize: 28 }}>
          Akışını kuralım
        </AppText>
        <AppText variant="body" muted>
          Bu bilgilerle takvimin ve hatırlatmaların kendini kurar.
        </AppText>
      </View>

      <ToggleRow title="Düzenli maaş alıyorum" subtitle="Zaman Nehri'nde maaş gününü ve bakiyeni gösterir" value={hasSalary} onChange={setHasSalary} />
      {hasSalary ? (
        <>
          <Stepper label="Maaş günün" value={salaryDay} min={1} max={31} onChange={setSalaryDay} />
          <TextField label="Net maaş (₺) — isteğe bağlı" placeholder="52.000" value={salaryText} onChangeText={setSalaryText} keyboardType="decimal-pad" />
        </>
      ) : null}

      <View style={{ gap: 6 }}>
        <AppText variant="heading">Varsayılan hatırlatma</AppText>
        <AppText variant="caption" muted>
          Yeni eklediğin her fatura ve kart bu ayarla başlar; tek tek değiştirebilirsin.
        </AppText>
      </View>
      <ReminderPicker value={reminders} onChange={setReminders} />

      <ToggleRow title="Şimdi ilk kredi kartımı ekle" subtitle="Kesim ve son ödeme günü ile ekstre takibi başlar" value={addCard} onChange={setAddCard} />

      <PrimaryButton title="Devam et" onPress={() => finish()} />
    </ScrollView>
  );
}
