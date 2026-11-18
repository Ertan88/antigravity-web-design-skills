import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthName } from '../../core/dates';
import { billNextDue } from '../../core/ledger';
import { formatTL } from '../../core/money';
import { daysUntil, dueLabel, formatLongDate } from '../../core/schedule';
import { markBillPaid } from '../../features/markPaid';
import { billDueForPeriod } from '../../store/analytics';
import { findCategory } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts } from '../../theme/tokens';
import { AppText, CategoryBadge, Chip, IconButton, PrimaryButton, Surface } from '../../ui/primitives';

const periodLabel = (p: string) => {
  if (p === 'once') return 'Tek seferlik';
  const [y, m] = p.split('-').map(Number);
  return `${monthName(new Date(y, m - 1, 1))} ${y}`;
};

/** Fatura ayrıntısı: sıradaki ödeme, Ödedim, düzenle ve ödeme geçmişi. */
export default function BillDetailScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const now = useMemo(() => new Date(), []);
  const bill = state.bills.find((b) => b.id === id);

  if (!bill) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: insets.top + 12, paddingHorizontal: 20, gap: 16 }}>
        <IconButton icon="back" label="Geri" onPress={() => router.back()} />
        <AppText variant="body" muted>
          Fatura bulunamadı.
        </AppText>
      </View>
    );
  }

  const cat = findCategory(state, bill.typeId);
  const next = billNextDue(bill, now);
  const days = next ? daysUntil(next.due, now) : null;
  const history = [...bill.paidPeriods].sort().reverse();
  const reminderText = bill.reminders.offsets.length
    ? `${bill.reminders.offsets.map((o) => (o === 'D-3' ? '3 gün önce' : o === 'D-1' ? '1 gün önce' : 'son gün')).join(', ')} · ${String(bill.reminders.hour).padStart(2, '0')}:${String(bill.reminders.minute).padStart(2, '0')}`
    : 'Kapalı';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="back" label="Geri" onPress={() => router.back()} />
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/add', params: { billId: bill.id } })} hitSlop={8}>
          <AppText variant="label" color={palette.accent}>
            Düzenle
          </AppText>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <CategoryBadge category={cat} size={56} />
        <View style={{ flex: 1 }}>
          <AppText variant="title" accessibilityRole="header">
            {bill.title}
          </AppText>
          <AppText variant="caption" muted>
            {[cat.name, bill.institution, bill.subscriberNo ? `Abone ${bill.subscriberNo}` : null].filter(Boolean).join(' · ')}
          </AppText>
        </View>
      </View>

      <Surface style={{ padding: 16, gap: 10 }}>
        {next ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="label" muted>
                {periodLabel(next.period)} · son ödeme
              </AppText>
              <Chip text={dueLabel(days!)} color={days! < 0 ? palette.danger : days! <= 3 ? palette.warn : palette.info} background={days! < 0 ? palette.dangerBg : days! <= 3 ? palette.warnBg : palette.infoBg} />
            </View>
            <AppText variant="display" style={{ fontSize: 34 }}>
              {bill.variableAmount ? '≈ ' : ''}
              {formatTL(bill.amount)}
            </AppText>
            <AppText variant="label" muted style={{ fontFamily: fonts.body }}>
              {formatLongDate(next.due)}
            </AppText>
            <PrimaryButton title="Ödedim" onPress={() => markBillPaid(state, dispatch, bill.id, next.period)} />
          </>
        ) : (
          <AppText variant="bodyStrong" color={palette.accent}>
            Ödenecek dönem yok — hepsi ödendi.
          </AppText>
        )}
      </Surface>

      <Surface style={{ padding: 14, gap: 6 }}>
        <AppText variant="caption" muted>
          Hatırlatma
        </AppText>
        <AppText variant="bodyStrong">{reminderText}</AppText>
        {bill.shared ? (
          <AppText variant="caption" muted>
            Ev bütçesiyle paylaşılıyor
          </AppText>
        ) : null}
      </Surface>

      <AppText variant="heading" accessibilityRole="header">
        Ödeme geçmişi
      </AppText>
      {history.length === 0 ? (
        <AppText variant="body" muted>
          Henüz ödendi işaretlenmedi.
        </AppText>
      ) : (
        history.map((p) => {
          const paidAt = bill.paidLog?.[p];
          const late = paidAt && p !== 'once' ? new Date(paidAt) > new Date(billDueForPeriod(bill, p).getTime() + 86_399_999) : false;
          return (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityHint="Ödendi işaretini geri almak için basılı tut"
              onLongPress={() =>
                Alert.alert(periodLabel(p), 'Ödendi işareti geri alınsın mı?', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Geri al', style: 'destructive', onPress: () => dispatch({ type: 'bill/unmarkPaid', id: bill.id, period: p }) },
                ])
              }
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.surface, borderRadius: 14, padding: 12 }}
            >
              <View>
                <AppText variant="bodyStrong">{periodLabel(p)}</AppText>
                <AppText variant="caption" muted>
                  {paidAt ? `ödendi ${new Date(paidAt).toLocaleDateString('tr-TR')}` : 'ödendi'}
                  {bill.paidBy?.[p] ? ` · ${bill.paidBy[p]}` : ''}
                </AppText>
              </View>
              <Chip text={late ? 'Geç ödendi' : 'Zamanında'} color={late ? palette.warn : palette.accent} background={late ? palette.warnBg : palette.glow} />
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
