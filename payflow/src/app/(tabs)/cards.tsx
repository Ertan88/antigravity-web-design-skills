import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthName } from '../../core/dates';
import { cardCurrentDue, cardLedger, statementInterest } from '../../core/ledger';
import { formatTL } from '../../core/money';
import { dueLabel, daysUntil } from '../../core/schedule';
import { useStore } from '../../store/StoreProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText, Chip, IconButton, PrimaryButton, Surface } from '../../ui/primitives';

/** Kart listesi. Ekstre dökümü, ödeme kaydı ve simülatör Adım 4'te. */
export default function CardsScreen() {
  const { palette } = useTheme();
  const { state, dispatch } = useStore();
  const insets = useSafeAreaInsets();
  const now = useMemo(() => new Date(), []);

  const rows = useMemo(
    () =>
      state.cards.map((c) => {
        const ledger = cardLedger(c, state.expenses, state.cardPayments, now);
        const due = cardCurrentDue(ledger, now);
        const used = ledger.length ? ledger[ledger.length - 1].result.total : 0;
        return { card: c, due, used };
      }),
    [state, now],
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 32, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="title" accessibilityRole="header">
          Kartlarım
        </AppText>
        <IconButton icon="plus" label="Kart ekle" onPress={() => router.push('/card-new')} />
      </View>

      {rows.length === 0 ? (
        <Surface style={{ padding: 20, gap: 12 }}>
          <AppText variant="body" muted>
            Henüz kart yok. Kart eklediğinde ekstre, devreden borç ve tahmini faiz burada görünür.
          </AppText>
          <PrimaryButton title="Kart ekle" onPress={() => router.push('/card-new')} />
        </Surface>
      ) : (
        rows.map(({ card, due, used }) => {
          const interest = due ? statementInterest(due.statement.result) : 0;
          const usage = card.limit ? Math.min(1, used / card.limit) : 0;
          return (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityLabel={`${card.name}, ${due ? formatTL(due.amount) : 'borç yok'}`}
              onLongPress={() =>
                Alert.alert(card.name, 'Kart ve ona ait tüm harcamalar silinsin mi?', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Sil', style: 'destructive', onPress: () => dispatch({ type: 'card/remove', id: card.id }) },
                ])
              }
              style={{ borderRadius: 22, backgroundColor: card.color, padding: 18, gap: 14, overflow: 'hidden' }}
            >
              <View style={{ position: 'absolute', right: -50, top: -70, width: 200, height: 200, borderRadius: 100, borderWidth: 28, borderColor: 'rgba(255,255,255,0.08)' }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="heading" color="#FFFFFF">
                  {card.name}
                </AppText>
                <AppText variant="caption" color="#FFFFFF">
                  Kesim {card.cutDay} · Son ödeme {card.dueDay}
                </AppText>
              </View>
              <AppText variant="money" color="#FFFFFF" style={{ fontSize: 17, letterSpacing: 2 }}>
                •••• {card.last4}
              </AppText>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="caption" color="#FFFFFF">
                    Kullanılan {formatTL(used)}
                  </AppText>
                  <AppText variant="caption" color="#FFFFFF">
                    Limit {formatTL(card.limit)}
                  </AppText>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' }}>
                  <View style={{ width: `${usage * 100}%`, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }} />
                </View>
              </View>
              {due ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, padding: 12 }}>
                  <View>
                    <AppText variant="caption" color="#FFFFFF">
                      {monthName(due.statement.cut)} {due.projected ? 'dönemi (tahmini)' : 'ekstresi'}
                      {interest ? ` · faiz ${formatTL(interest)}` : ''}
                    </AppText>
                    <AppText variant="money" color="#FFFFFF" style={{ fontSize: 20 }}>
                      {formatTL(due.amount)}
                    </AppText>
                  </View>
                  <Chip text={dueLabel(daysUntil(due.due, now))} color="#FFFFFF" background="rgba(255,255,255,0.18)" />
                </View>
              ) : null}
            </Pressable>
          );
        })
      )}
      {rows.length ? (
        <AppText variant="caption" muted>
          Ekstre dökümü, ödeme kaydı ve Asgari Tuzağı Simülatörü Adım 4'te. Kartı silmek için basılı tut.
        </AppText>
      ) : null}
    </ScrollView>
  );
}
