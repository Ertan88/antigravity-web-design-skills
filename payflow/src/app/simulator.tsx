import Slider from '@react-native-community/slider';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ratesFor } from '../core/finance/rates';
import { fixedPayment, minimumOnly, simulatePayoff } from '../core/finance/simulator';
import { cardLedger } from '../core/ledger';
import { formatTL, Kurus } from '../core/money';
import { useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { ChoiceChip } from '../ui/form';
import { Icon } from '../ui/icons';
import { AppText, IconButton, Surface } from '../ui/primitives';

const STEP = 10_000; // 100 TL

const pct = (r: number) => `%${(r * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

/** Asgari Tuzağı Simülatörü: yeni harcama yok varsayımıyla borcun bitiş süresi ve toplam faizi. */
export default function SimulatorScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, cut } = useLocalSearchParams<{ id: string; cut?: string }>();
  const { state } = useStore();
  const now = useMemo(() => new Date(), []);
  const card = state.cards.find((c) => c.id === id);
  const st = useMemo(() => {
    if (!card) return undefined;
    const l = cardLedger(card, state.expenses, state.cardPayments, now);
    return l.find((s) => String(s.cut.getTime()) === cut) ?? l[l.length - 1];
  }, [card, state, cut, now]);

  const balance: Kurus = st ? (st.remaining > 0 ? st.remaining : st.result.total) : 0;
  const rate = ratesFor(balance, card?.rateOverride).contractual;
  const minRate = st?.result.minimumRate ?? 0.2;
  const minimum = Math.round(balance * minRate);
  // Kaydırıcının alt sınırı: aylık faizi karşılayan en düşük ödeme (aksi halde borç hiç bitmez).
  const floor = Math.min(balance, Math.ceil((balance * rate * 1.3 * 1.05) / STEP) * STEP);
  const [pay, setPay] = useState<Kurus>(Math.max(minimum, floor));

  const run = useMemo(() => simulatePayoff(balance, rate, fixedPayment(pay)), [balance, rate, pay]);
  const minOnly = useMemo(() => simulatePayoff(balance, rate, minimumOnly(minRate)), [balance, rate, minRate]);

  if (!card || !st || balance <= 0) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: insets.top + 12, paddingHorizontal: 20, gap: 16 }}>
        <IconButton icon="back" label="Geri" onPress={() => router.back()} />
        <AppText variant="body" muted>
          Simüle edilecek borç yok.
        </AppText>
      </View>
    );
  }

  const bars = [balance, ...run.balances].slice(0, 24);
  const saved = minOnly.totalInterest - run.totalInterest;
  const presets = [
    { label: 'Asgari', value: minimum },
    { label: '%50', value: Math.round(balance / 2) },
    { label: 'Tamamı', value: balance },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton icon="back" label="Geri" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading" accessibilityRole="header">
            Asgari Tuzağı Simülatörü
          </AppText>
          <AppText variant="caption" muted numberOfLines={1}>
            {card.name} · borç {formatTL(balance)} · yeni harcama yok varsayımı
          </AppText>
        </View>
      </View>

      <Surface style={{ padding: 16, gap: 10 }}>
        <AppText variant="label" muted>
          Her ay ödeyeceğim tutar
        </AppText>
        <AppText variant="display" style={{ fontSize: 38 }}>
          {formatTL(pay)}
        </AppText>
        <Slider
          accessibilityLabel="Aylık ödeme tutarı"
          minimumValue={floor}
          maximumValue={balance}
          step={STEP}
          value={pay}
          onValueChange={(v) => setPay(Math.round(v))}
          minimumTrackTintColor={palette.button}
          maximumTrackTintColor={palette.surface2}
          thumbTintColor={palette.button}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" muted>
            {formatTL(floor)}
          </AppText>
          <AppText variant="caption" muted>
            Tamamı
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {presets.map((p) => (
            <ChoiceChip key={p.label} label={p.label} selected={Math.abs(pay - p.value) < 100} onPress={() => setPay(p.value)} />
          ))}
        </View>
      </Surface>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Surface style={{ flex: 1, padding: 14 }}>
          <AppText variant="caption" muted>
            Borç biter
          </AppText>
          <AppText variant="title">{!run.finished ? '20+ yıl' : run.months === 1 ? 'Bu ay' : `${run.months} ayda`}</AppText>
        </Surface>
        <View style={{ flex: 1, padding: 14, borderRadius: 22, borderWidth: 1, borderColor: palette.line, backgroundColor: run.totalInterest ? palette.dangerBg : palette.glow }}>
          <AppText variant="caption" muted>
            Toplam faiz ≈
          </AppText>
          <AppText variant="title" color={run.totalInterest ? palette.danger : palette.accent}>
            {formatTL(run.totalInterest)}
          </AppText>
        </View>
      </View>

      <Surface style={{ padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" muted>
            Ay ay kalan borç
          </AppText>
          <AppText variant="caption" muted>
            {bars.length > 1 ? `ilk ${Math.min(24, bars.length)} ay` : ''}
          </AppText>
        </View>
        <View accessible accessibilityLabel={`Kalan borç ${run.months} ayda sıfırlanıyor`} style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
          {bars.map((b, i) => (
            <View
              key={i}
              style={{ flex: 1, height: Math.max(2, Math.round((b / balance) * 118)), borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: i === 0 ? palette.info : b > 0 ? palette.danger : palette.accent }}
            />
          ))}
        </View>
      </Surface>

      <View style={{ flexDirection: 'row', gap: 12, backgroundColor: palette.warnBg, borderRadius: 18, padding: 14 }}>
        <Icon name="bulb" size={22} color={palette.warn} />
        <AppText variant="label" style={{ flex: 1, fontFamily: fonts.body, lineHeight: 20 }}>
          Her ay sadece asgari ödersen borç{' '}
          <AppText variant="label" style={{ fontFamily: fonts.bodyBold }}>
            {minOnly.finished ? `${minOnly.months} ayda biter` : '20 yılda bile bitmez'}
          </AppText>
          {minOnly.finished ? ' ve ' : '; bu sürede '}
          <AppText variant="label" color={palette.danger} style={{ fontFamily: fonts.bodyBold }}>
            {formatTL(minOnly.totalInterest)}
          </AppText>{' '}
          faiz ödersin.
          {saved > 100 ? ` Seçtiğin planla ${formatTL(saved)} tasarruf edersin.` : ''}
        </AppText>
      </View>

      <AppText variant="caption" muted>
        Akdi faiz {pct(rate)} {card.rateOverride?.contractual ? '(senin girdiğin oran)' : '(TCMB tavanı)'} + %15 KKDF + %15 BSMV. Sonuçlar tahminidir.
      </AppText>
    </ScrollView>
  );
}
