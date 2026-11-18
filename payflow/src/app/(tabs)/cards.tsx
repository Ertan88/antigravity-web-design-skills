import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthName } from '../../core/dates';
import { cardCurrentDue, cardLedger, statementInterest } from '../../core/ledger';
import { formatTL } from '../../core/money';
import { daysUntil, dueLabel } from '../../core/schedule';
import { useStore } from '../../store/StoreProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { CardVisual } from '../../ui/CardVisual';
import { AppText, Chip, IconButton, PrimaryButton, Surface } from '../../ui/primitives';

/** Kart listesi: her kartın güncel ekstresi; dokununca kart ve ekstre ayrıntısı. */
export default function CardsScreen() {
  const { palette } = useTheme();
  const { state } = useStore();
  const insets = useSafeAreaInsets();
  const now = useMemo(() => new Date(), []);

  const rows = useMemo(
    () =>
      state.cards.map((c) => {
        const ledger = cardLedger(c, state.expenses, state.cardPayments, now);
        return { card: c, due: cardCurrentDue(ledger, now), used: ledger.length ? ledger[ledger.length - 1].result.total : 0 };
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
          return (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityLabel={`${card.name}, ${due ? formatTL(due.amount) : 'borç yok'}`}
              accessibilityHint="Kart ve ekstre ayrıntısını açar"
              onPress={() => router.push(`/card/${card.id}`)}
              style={{ gap: 8 }}
            >
              <CardVisual name={card.name} last4={card.last4} color={card.color} cutDay={card.cutDay} dueDay={card.dueDay} limit={card.limit} used={used} />
              {due ? (
                <Surface style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingHorizontal: 14, borderRadius: 16 }}>
                  <View>
                    <AppText variant="caption" muted>
                      {monthName(due.statement.cut)} {due.projected ? 'dönemi (tahmini)' : 'ekstresi'}
                      {interest ? ` · faiz ${formatTL(interest)}` : ''}
                    </AppText>
                    <AppText variant="money" style={{ fontSize: 18 }}>
                      {formatTL(due.amount)}
                    </AppText>
                  </View>
                  <Chip text={dueLabel(daysUntil(due.due, now))} color={palette.info} background={palette.infoBg} />
                </Surface>
              ) : null}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
