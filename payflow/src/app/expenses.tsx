import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthName } from '../core/dates';
import { Expense } from '../core/model';
import { formatTL, sum } from '../core/money';
import { formatLongDate } from '../core/schedule';
import { findCategory } from '../store/selectors';
import { useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { ChoiceChip } from '../ui/form';
import { AppText, CategoryBadge, IconButton } from '../ui/primitives';

type Filter = 'all' | 'cash' | 'debit' | 'card';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'cash', label: 'Nakit' },
  { value: 'debit', label: 'Banka kartı' },
  { value: 'card', label: 'Kredi kartı' },
];

/** Harcama geçmişi: ay ay, kaynağa göre süzülebilir; basılı tutarak silme. */
export default function ExpensesScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const params = useLocalSearchParams<{ month?: string }>();
  const now = useMemo(() => new Date(), []);
  const [offset, setOffset] = useState(Number(params.month ?? 0) || 0);
  const [filter, setFilter] = useState<Filter>('all');
  const month = useMemo(() => new Date(now.getFullYear(), now.getMonth() + offset, 1), [now, offset]);

  const sections = useMemo(() => {
    const list = state.expenses
      .filter((e) => {
        const d = new Date(e.date);
        return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth() && (filter === 'all' || e.source.type === filter);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
    const byDay = new Map<string, Expense[]>();
    for (const e of list) {
      const k = new Date(e.date).toDateString();
      byDay.set(k, [...(byDay.get(k) ?? []), e]);
    }
    return [...byDay.values()].map((data) => ({ title: formatLongDate(new Date(data[0].date)), total: sum(data.map((e) => e.amount)), data }));
  }, [state.expenses, filter, month]);

  const total = sum(sections.map((s) => s.total));
  const sourceName = (e: Expense) =>
    e.source.type === 'cash' ? 'Nakit' : e.source.type === 'debit' ? 'Banka kartı' : state.cards.find((c) => e.source.type === 'card' && c.id === e.source.cardId)?.name ?? 'Kredi kartı';

  return (
    <SectionList
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 8 }}
      sections={sections}
      keyExtractor={(e) => e.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={{ gap: 14, marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <IconButton icon="back" label="Geri" onPress={() => router.back()} />
            <AppText variant="heading" accessibilityRole="header">
              Harcamalar
            </AppText>
            <View style={{ width: 44 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <IconButton icon="back" label="Önceki ay" onPress={() => setOffset((o) => o - 1)} />
            <View style={{ alignItems: 'center' }}>
              <AppText variant="bodyStrong">
                {monthName(month)} {month.getFullYear()}
              </AppText>
              <AppText variant="money" style={{ fontSize: 20 }}>
                {formatTL(total)}
              </AppText>
            </View>
            <IconButton icon="chevronRight" label="Sonraki ay" onPress={() => setOffset((o) => Math.min(0, o + 1))} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {FILTERS.map((f) => (
              <ChoiceChip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
            ))}
          </View>
        </View>
      }
      ListEmptyComponent={
        <AppText variant="body" muted>
          Bu ay için kayıt yok.
        </AppText>
      }
      renderSectionHeader={({ section }) => (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <AppText variant="label" muted>
            {section.title}
          </AppText>
          <AppText variant="label" muted>
            {formatTL(section.total)}
          </AppText>
        </View>
      )}
      renderItem={({ item: e }) => {
        const cat = findCategory(state, e.categoryId);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${e.note || cat.name}, ${formatTL(e.amount)}, ${sourceName(e)}`}
            accessibilityHint="Silmek için basılı tut"
            onLongPress={() =>
              Alert.alert(e.note || cat.name, `${formatTL(e.amount)} silinsin mi?`, [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Sil', style: 'destructive', onPress: () => dispatch({ type: 'expense/remove', id: e.id }) },
              ])
            }
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderRadius: 14, padding: 10, paddingHorizontal: 12 }}
          >
            <CategoryBadge category={cat} size={36} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {e.note || cat.name}
              </AppText>
              <AppText variant="caption" muted numberOfLines={1}>
                {sourceName(e)}
                {e.installments > 1 ? ` · ${e.installments} taksit` : ''}
              </AppText>
            </View>
            <AppText variant="money">{formatTL(e.amount)}</AppText>
          </Pressable>
        );
      }}
      ListFooterComponent={
        sections.length ? (
          <AppText variant="caption" muted style={{ marginTop: 10 }}>
            Silmek için harcamaya basılı tut.
          </AppText>
        ) : undefined
      }
    />
  );
}
