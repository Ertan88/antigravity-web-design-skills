import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthName, uid } from '../core/dates';
import { carryPreview, cardLedger } from '../core/ledger';
import { formatTL, toLira } from '../core/money';
import { parseAmount } from '../core/parse';
import { useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { ChoiceChip, SectionLabel, TextField } from '../ui/form';
import { AppText, IconButton, PrimaryButton, Surface } from '../ui/primitives';

const asInput = (k: number) => toLira(k).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Kart ödemesi: asgari / tamamı / serbest tutar; kalanın faiziyle devrini önizler. */
export default function CardPayScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, cut } = useLocalSearchParams<{ id: string; cut?: string }>();
  const { state, dispatch } = useStore();
  const now = useMemo(() => new Date(), []);
  const card = state.cards.find((c) => c.id === id);
  const ledger = useMemo(() => (card ? cardLedger(card, state.expenses, state.cardPayments, now) : []), [card, state, now]);
  const st = ledger.find((s) => String(s.cut.getTime()) === cut) ?? ledger[ledger.length - 1];

  const remaining = st ? st.remaining : 0;
  const minLeft = st ? Math.max(0, st.result.minimum - st.paidAfterCut) : 0;
  const [text, setText] = useState(remaining > 0 ? asInput(remaining) : '');
  const [yesterday, setYesterday] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!card || !st) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, padding: 20, paddingTop: insets.top + 12 }}>
        <IconButton icon="close" label="Kapat" onPress={() => router.back()} />
      </View>
    );
  }

  const amount = parseAmount(text) ?? 0;
  const preview = carryPreview(card, st, st.paidAfterCut + amount);

  const save = () => {
    if (amount <= 0) return setError('Ödeme tutarını gir');
    const d = new Date();
    if (yesterday) d.setDate(d.getDate() - 1);
    dispatch({ type: 'cardPayment/add', payment: { id: uid('pay'), cardId: card.id, amount, date: d.toISOString() } });
    router.back();
  };

  const presets = [
    { label: `Asgari ${formatTL(minLeft)}`, value: minLeft },
    { label: `Tamamı ${formatTL(remaining)}`, value: remaining },
  ].filter((p) => p.value > 0);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="close" label="Kapat" onPress={() => router.back()} />
          <AppText variant="heading" accessibilityRole="header">
            Ödeme kaydet
          </AppText>
          <View style={{ width: 44 }} />
        </View>

        <Surface style={{ padding: 16, gap: 4 }}>
          <AppText variant="label" muted>
            {card.name} · {monthName(st.cut)} {st.closed ? 'ekstresi' : 'dönemi'}
          </AppText>
          <AppText variant="title">{formatTL(remaining)}</AppText>
          <AppText variant="caption" muted>
            kalan · toplam {formatTL(st.result.total)}
            {st.paidAfterCut ? ` · ödenen ${formatTL(st.paidAfterCut)}` : ''}
          </AppText>
        </Surface>

        {presets.length ? (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {presets.map((p) => (
              <ChoiceChip key={p.label} label={p.label} selected={amount === p.value} onPress={() => { setText(asInput(p.value)); setError(null); }} />
            ))}
          </View>
        ) : null}

        <TextField label="Ödenen tutar (₺)" value={text} onChangeText={(t) => { setText(t); setError(null); }} keyboardType="decimal-pad" error={error} />

        <SectionLabel>ÖDEME TARİHİ</SectionLabel>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ChoiceChip label="Bugün" selected={!yesterday} onPress={() => setYesterday(false)} />
          <ChoiceChip label="Dün" selected={yesterday} onPress={() => setYesterday(true)} />
        </View>

        {st.closed && amount > 0 ? (
          preview.carried > 0 ? (
            <View style={{ backgroundColor: preview.belowMinimum ? palette.dangerBg : palette.warnBg, borderRadius: 16, padding: 14, gap: 4 }}>
              <AppText variant="bodyStrong" color={preview.belowMinimum ? palette.danger : palette.warn}>
                {preview.belowMinimum ? 'Asgari tutarın altında' : 'Kalan sonraki ekstreye devreder'}
              </AppText>
              <AppText variant="label" style={{ fontFamily: fonts.body }}>
                {formatTL(preview.carried)} devreder; bunun ≈ {formatTL(preview.interest)}'si faiz ve vergi.
                {preview.belowMinimum ? ' Asgarinin ödenmeyen kısmına gecikme faizi uygulanır ve kredi notun etkilenebilir.' : ''}
              </AppText>
            </View>
          ) : (
            <View style={{ backgroundColor: palette.glow, borderRadius: 16, padding: 14 }}>
              <AppText variant="bodyStrong" color={palette.accent}>
                Ekstre tamamen kapanır, faiz yok.
              </AppText>
            </View>
          )
        ) : null}

        <PrimaryButton title="Ödemeyi kaydet" onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
