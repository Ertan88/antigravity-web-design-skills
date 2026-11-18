import { router, useLocalSearchParams } from 'expo-router';
import { ReactNode, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthName } from '../../core/dates';
import { cardCurrentDue, cardLedger, dailyCarryInterest, statementPayments, statementPurchases } from '../../core/ledger';
import { formatTL, Kurus, sum } from '../../core/money';
import { daysUntil, dueLabel, formatShortDate } from '../../core/schedule';
import { findCategory } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts } from '../../theme/tokens';
import { CardVisual } from '../../ui/CardVisual';
import { ChoiceChip } from '../../ui/form';
import { AppText, CategoryBadge, Chip, IconButton, PrimaryButton, Surface } from '../../ui/primitives';

const pct = (r: number) => `%${(r * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

/** Kart ve ekstre: dönem seçici, döküm (devir + faiz + vergiler + taksitler), işlemler. */
export default function CardDetailScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const now = useMemo(() => new Date(), []);
  const card = state.cards.find((c) => c.id === id);

  const ledger = useMemo(() => (card ? cardLedger(card, state.expenses, state.cardPayments, now) : []), [card, state.expenses, state.cardPayments, now]);
  const focus = useMemo(() => cardCurrentDue(ledger, now)?.statement ?? ledger[ledger.length - 1], [ledger, now]);
  const [selectedCut, setSelectedCut] = useState<number | null>(null);
  const st = ledger.find((s) => s.cut.getTime() === selectedCut) ?? focus;

  if (!card || !st) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: insets.top + 12, paddingHorizontal: 20, gap: 16 }}>
        <IconButton icon="back" label="Geri" onPress={() => router.back()} />
        <AppText variant="body" muted>
          Kart bulunamadı.
        </AppText>
      </View>
    );
  }

  const daily = dailyCarryInterest(st);
  const purchases = statementPurchases(card, state.expenses, st);
  const payments = statementPayments(card, state.cardPayments, st);
  const installmentsTotal = sum(st.installmentLines.map((l) => l.amount));
  const credit = st.result.carriedTotal + st.singlePurchases + installmentsTotal - st.result.total;
  const r = st.result;
  const minLeft = Math.max(0, r.minimum - st.paidAfterCut);

  const confirmDelete = (title: string, onYes: () => void) =>
    Alert.alert(title, 'Silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: onYes },
    ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="back" label="Geri" onPress={() => router.back()} />
        <AppText variant="heading" accessibilityRole="header">
          {card.name}
        </AppText>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/card-new', params: { id: card.id } })} hitSlop={8} style={{ minWidth: 44, alignItems: 'flex-end' }}>
          <AppText variant="label" color={palette.accent}>
            Düzenle
          </AppText>
        </Pressable>
      </View>

      <CardVisual name={card.name} last4={card.last4} color={card.color} cutDay={card.cutDay} dueDay={card.dueDay} limit={card.limit} used={ledger[ledger.length - 1]?.result.total ?? 0} />

      {daily > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.dangerBg, borderRadius: 14, padding: 12 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.danger }} />
          <AppText variant="label" style={{ flex: 1, fontFamily: fonts.body }}>
            Devreden borca her gün <AppText variant="label" color={palette.danger} style={{ fontFamily: fonts.bodyBold }}>≈ {formatTL(daily)}</AppText> faiz işliyor
          </AppText>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {ledger.slice(-6).map((s) => (
          <ChoiceChip key={s.cut.getTime()} label={`${monthName(s.cut)}${s.closed ? '' : ' (açık)'}`} selected={s === st} onPress={() => setSelectedCut(s.cut.getTime())} />
        ))}
      </ScrollView>

      <Surface style={{ padding: 16, gap: 9 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="heading">
            {monthName(st.cut)} {st.closed ? 'ekstresi' : 'dönemi'}
          </AppText>
          <Chip text={st.closed ? `kesim ${formatShortDate(st.cut)}` : '≈ tahmini'} color={palette.warn} background={palette.warnBg} />
        </View>
        {st.isOpening ? (
          <Line label="Açılış ekstresi (uygulama öncesi)" value={r.total} />
        ) : (
          <>
            {r.carriedPrincipal > 0 ? <Line label="Önceki dönemden devreden" value={r.carriedPrincipal} /> : null}
            {r.contractualInterest > 0 ? <Line label={`Akdi faiz ${pct(r.appliedRates.contractual)}`} value={r.contractualInterest} fee /> : null}
            {r.lateInterest > 0 ? <Line label={`Gecikme faizi ${pct(r.appliedRates.late)}`} value={r.lateInterest} fee /> : null}
            {r.kkdf + r.bsmv > 0 ? <Line label="KKDF %15 · BSMV %15" value={r.kkdf + r.bsmv} fee /> : null}
            <Line label={`Harcamalar (${purchases.length} işlem)`} value={st.singlePurchases} />
            {installmentsTotal > 0 ? <Line label="Bu döneme düşen taksitler" value={installmentsTotal} /> : null}
            {st.installmentLines.map((l) => (
              <Line key={`${l.purchaseId}-${l.index}`} label={`${l.title} ${l.index}/${l.count}`} value={l.amount} sub />
            ))}
            {credit > 0 ? <Line label="Önceki fazla ödeme (alacak)" value={-credit} /> : null}
          </>
        )}
        <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: palette.line, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <AppText variant="bodyStrong">Toplam dönem borcu</AppText>
          <AppText variant="title" style={{ fontSize: 22 }}>
            {formatTL(r.total)}
          </AppText>
        </View>
        <Line label={`Asgari ödeme (${pct(r.minimumRate)})`} value={r.minimum} muted />
        {st.paidAfterCut > 0 ? <Line label="Ödenen" value={-st.paidAfterCut} muted /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="label" muted>
            Son ödeme {formatShortDate(st.due)}
          </AppText>
          {st.remaining > 0 ? (
            <Chip text={`Kalan ${formatTL(st.remaining)} · ${dueLabel(daysUntil(st.due, now))}`} color={palette.info} background={palette.infoBg} />
          ) : (
            <Chip text="Ödendi" color={palette.accent} background={palette.glow} />
          )}
        </View>
      </Surface>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/simulator', params: { id: card.id, cut: String(st.cut.getTime()) } })}
          style={{ flex: 1, height: 54, borderRadius: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <AppText variant="heading">Simüle et</AppText>
        </Pressable>
        <View style={{ flex: 1.4 }}>
          <PrimaryButton title="Ödeme kaydet" onPress={() => router.push({ pathname: '/card-pay', params: { id: card.id, cut: String(st.cut.getTime()) } })} />
        </View>
      </View>
      {minLeft > 0 && st.closed && st.remaining > 0 ? (
        <AppText variant="caption" muted>
          Asgari tutarın {formatTL(minLeft)}'si henüz ödenmedi. Asgarinin altında kalan kısma gecikme faizi işler.
        </AppText>
      ) : null}

      {purchases.length || payments.length ? (
        <View style={{ gap: 8 }}>
          <AppText variant="heading" accessibilityRole="header">
            İşlemler
          </AppText>
          {payments.map((p) => (
            <TxRow key={p.id} title="Kart ödemesi" date={new Date(p.date)} amount={-p.amount} positive onLongPress={() => confirmDelete('Ödeme', () => dispatch({ type: 'cardPayment/remove', id: p.id }))} />
          ))}
          {purchases.map((e) => {
            const cat = findCategory(state, e.categoryId);
            return (
              <TxRow
                key={e.id}
                title={e.note || cat.name}
                date={new Date(e.date)}
                amount={e.amount}
                badge={<CategoryBadge category={cat} size={34} />}
                onLongPress={() => confirmDelete(e.note || cat.name, () => dispatch({ type: 'expense/remove', id: e.id }))}
              />
            );
          })}
          <AppText variant="caption" muted>
            Silmek için işleme basılı tut.
          </AppText>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Line({ label, value, fee, sub, muted }: { label: string; value: Kurus; fee?: boolean; sub?: boolean; muted?: boolean }) {
  const { palette } = useTheme();
  const color = fee ? palette.danger : sub || muted ? palette.muted : palette.text;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: sub ? 12 : 0 }}>
      <AppText variant="label" color={sub || muted ? palette.muted : palette.text} style={{ fontFamily: fonts.body, flexShrink: 1 }}>
        {label}
      </AppText>
      <AppText variant="money" color={color} style={{ fontSize: 14 }}>
        {fee ? '+' : ''}
        {formatTL(value)}
      </AppText>
    </View>
  );
}

function TxRow({
  title,
  date,
  amount,
  badge,
  positive,
  onLongPress,
}: {
  title: string;
  date: Date;
  amount: Kurus;
  badge?: ReactNode;
  positive?: boolean;
  onLongPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatTL(amount)}, ${formatShortDate(date)}`}
      accessibilityHint="Silmek için basılı tut"
      onLongPress={onLongPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderRadius: 14, padding: 10, paddingHorizontal: 12 }}
    >
      {badge ?? <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: palette.glow }} />}
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" muted>
          {formatShortDate(date)}
        </AppText>
      </View>
      <AppText variant="money" color={positive ? palette.accent : palette.text}>
        {formatTL(amount)}
      </AppText>
    </Pressable>
  );
}

