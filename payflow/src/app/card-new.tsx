import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toISODate, uid } from '../core/dates';
import { interestFreeDays } from '../core/finance/billingCycle';
import { minimumPaymentRate, ratesFor } from '../core/finance/rates';
import { CARD_COLORS } from '../core/model';
import { formatTL } from '../core/money';
import { parseAmount, parseRate } from '../core/parse';
import { useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { SectionLabel, Stepper, TextField, ToggleRow } from '../ui/form';
import { AppText, IconButton, PrimaryButton } from '../ui/primitives';

const pct = (r: number) => `%${(r * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

export default function CardNewScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();

  const [name, setName] = useState('');
  const [last4, setLast4] = useState('');
  const [limitText, setLimitText] = useState('');
  const [cutDay, setCutDay] = useState(18);
  const [dueDay, setDueDay] = useState(28);
  const [color, setColor] = useState(CARD_COLORS[0]);
  const [openingText, setOpeningText] = useState('');
  const [openingPaidText, setOpeningPaidText] = useState('');
  const [firstYear, setFirstYear] = useState(false);
  const [rateText, setRateText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const limit = parseAmount(limitText) ?? 0;
  const opening = parseAmount(openingText) ?? 0;
  const rate = parseRate(rateText);
  const tcmb = ratesFor(opening);

  const save = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Karta bir ad ver (ör. Maaş Kartım)';
    if (last4 && !/^\d{4}$/.test(last4)) e.last4 = '4 hane olmalı';
    if (limit <= 0) e.limit = 'Kart limitini gir';
    if (openingText && parseAmount(openingText) === null) e.opening = 'Geçersiz tutar';
    if (openingPaidText && parseAmount(openingPaidText) === null) e.openingPaid = 'Geçersiz tutar';
    if (rateText && rate === null) e.rate = 'Ör. 3,11';
    setErrors(e);
    if (Object.keys(e).length) return;
    dispatch({
      type: 'card/add',
      card: {
        id: uid('card'),
        name: name.trim(),
        last4: last4 || '0000',
        limit,
        cutDay,
        dueDay,
        color,
        isFirstYear: firstYear,
        rateOverride: rate ? { contractual: rate, late: rate + 0.003 } : undefined,
        openingStatementTotal: opening || undefined,
        openingPaid: parseAmount(openingPaidText) || undefined,
        reminders: state.settings.defaultReminders,
        createdAt: toISODate(new Date()),
      },
    });
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, paddingHorizontal: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="back" label="Geri" onPress={() => router.back()} />
          <AppText variant="heading" accessibilityRole="header">
            Kart ekle
          </AppText>
          <View style={{ width: 44 }} />
        </View>

        <View style={{ height: 150, borderRadius: 22, backgroundColor: color, padding: 18, justifyContent: 'space-between', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -50, top: -70, width: 200, height: 200, borderRadius: 100, borderWidth: 28, borderColor: 'rgba(255,255,255,0.08)' }} />
          <AppText variant="heading" color="#FFFFFF">
            {name || 'Kart adı'}
          </AppText>
          <AppText variant="money" color="#FFFFFF" style={{ fontSize: 18, letterSpacing: 2 }}>
            •••• {last4 || '0000'}
          </AppText>
          <AppText variant="caption" color="#FFFFFF">
            Kesim {cutDay} · Son ödeme {dueDay}
            {limit ? ` · Limit ${formatTL(limit)}` : ''}
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel="Kart rengi">
          {CARD_COLORS.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ selected: c === color }}
              accessibilityLabel={`Renk ${c}`}
              onPress={() => setColor(c)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: 3, borderColor: c === color ? palette.accent : 'transparent' }}
            />
          ))}
        </View>

        <TextField label="Kart adı" placeholder="Maaş Kartım" value={name} onChangeText={setName} error={errors.name} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextField style={{ flex: 1 }} label="Son 4 hane" placeholder="4821" value={last4} onChangeText={(t) => setLast4(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} error={errors.last4} />
          <TextField style={{ flex: 1.4 }} label="Limit (₺)" placeholder="45.000" value={limitText} onChangeText={setLimitText} keyboardType="decimal-pad" error={errors.limit} />
        </View>

        <Stepper label="Hesap kesim günü" value={cutDay} min={1} max={31} onChange={setCutDay} />
        <Stepper label="Son ödeme günü" value={dueDay} min={1} max={31} onChange={setDueDay} />
        <AppText variant="caption" muted>
          Bugün bu kartla harcarsan ≈ <AppText variant="caption" style={{ fontFamily: fonts.bodyBold }}>{interestFreeDays(new Date(), { cutDay, dueDay })} gün</AppText> faizsiz süren olur. Asgari ödeme oranı {pct(minimumPaymentRate(limit, firstYear))}.
        </AppText>

        <SectionLabel>DEVREDEN BORÇ (VARSA)</SectionLabel>
        <TextField label="Son ekstre borcu (₺)" placeholder="20.000" value={openingText} onChangeText={setOpeningText} keyboardType="decimal-pad" error={errors.opening} hint="Uygulamaya eklemeden önceki son ekstrenin toplamı" />
        <TextField label="O ekstreye ödediğin (₺)" placeholder="8.000" value={openingPaidText} onChangeText={setOpeningPaidText} keyboardType="decimal-pad" error={errors.openingPaid} hint="Kalan kısım faiziyle bu döneme devreder" />

        <ToggleRow title="Kart 1 yıldan yeni" subtitle="Yeni kartlarda ilk yıl asgari ödeme %40" value={firstYear} onChange={setFirstYear} />
        <TextField
          label="Bankanın aylık akdi faizi (%)"
          placeholder={`Boş bırakırsan TCMB tavanı: ${pct(tcmb.contractual)}`}
          value={rateText}
          onChangeText={setRateText}
          keyboardType="decimal-pad"
          error={errors.rate}
          hint="Faiz hesapları tahminidir; bankanın tarifesi farklıysa buradan düzelt."
        />

        <PrimaryButton title="Kartı kaydet" onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
