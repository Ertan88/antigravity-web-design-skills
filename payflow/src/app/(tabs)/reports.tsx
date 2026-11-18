import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthName } from '../../core/dates';
import { formatTL } from '../../core/money';
import { shareMonthCsv, shareMonthPdf } from '../../features/share';
import { detectSubscriptions, healthReport, householdSplit, monthReport, subscriptionToBill } from '../../store/analytics';
import { useStore } from '../../store/StoreProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts } from '../../theme/tokens';
import { Icon } from '../../ui/icons';
import { AppText, CategoryBadge, IconButton, ScoreRing, Surface } from '../../ui/primitives';

const pct = (r: number) => `%${Math.round(r * 100)}`;

export default function ReportsScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const now = useMemo(() => new Date(), []);
  const [offset, setOffset] = useState(0);
  const month = useMemo(() => new Date(now.getFullYear(), now.getMonth() + offset, 1), [now, offset]);

  const health = useMemo(() => healthReport(state, now), [state, now]);
  const report = useMemo(() => monthReport(state, month, now), [state, month, now]);
  const subs = useMemo(() => detectSubscriptions(state, now), [state, now]);
  const split = useMemo(() => householdSplit(state, month), [state, month]);
  const subsTotal = subs.reduce((a, s) => a + s.monthly, 0);
  const max = report.byCategory[0]?.amount || 1;
  const isPast = offset < 0;

  const exportAs = (kind: 'pdf' | 'csv') =>
    (kind === 'pdf' ? shareMonthPdf(report, health) : shareMonthCsv(report)).catch(() => Alert.alert('Dışa aktarılamadı', 'Lütfen tekrar dene.'));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 32, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="title" accessibilityRole="header">
          Raporlar
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconButton icon="back" label="Önceki ay" onPress={() => setOffset((o) => o - 1)} />
          <AppText variant="bodyStrong" style={{ minWidth: 92, textAlign: 'center' }} accessibilityLiveRegion="polite">
            {monthName(month)} {month.getFullYear()}
          </AppText>
          <IconButton icon="chevronRight" label="Sonraki ay" onPress={() => setOffset((o) => Math.min(0, o + 1))} />
        </View>
      </View>

      <Surface style={{ padding: 16, flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        <ScoreRing score={health.score} size={96} stroke={9} />
        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="heading">
            Ödeme sağlığı · <AppText variant="heading" color={health.score >= 70 ? palette.accent : health.score >= 50 ? palette.warn : palette.danger}>{health.label}</AppText>
          </AppText>
          <Factor label="Zamanında ödeme" value={health.onTimeRate === null ? '—' : pct(health.onTimeRate)} color={palette.accent} />
          <Factor label="Tam ödenen ekstre" value={health.cardStatements ? `${health.fullStatements} / ${health.cardStatements}` : '—'} color={palette.warn} />
          <Factor label="Ödenen faiz (3 ay)" value={formatTL(health.interestPaid)} color={health.interestPaid ? palette.danger : palette.accent} />
          {health.overdueNow ? <Factor label="Şu an gecikmede" value={`${health.overdueNow}`} color={palette.danger} /> : null}
        </View>
      </Surface>
      {health.tip ? (
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: palette.warnBg, borderRadius: 16, padding: 12 }}>
          <Icon name="bulb" size={20} color={palette.warn} />
          <AppText variant="label" style={{ flex: 1, fontFamily: fonts.body }}>
            {health.tip}
          </AppText>
        </View>
      ) : null}

      <Surface style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <AppText variant="heading" accessibilityRole="header">
            Nereye gitti?
          </AppText>
          <AppText variant="money" style={{ fontSize: 17 }}>
            {formatTL(report.total)}
          </AppText>
        </View>
        {report.change !== null ? (
          <AppText variant="caption" color={report.change > 0 ? palette.danger : palette.accent}>
            Geçen aya göre {report.change > 0 ? '▲' : '▼'} {pct(Math.abs(report.change))}
          </AppText>
        ) : null}
        {report.byCategory.length === 0 ? (
          <AppText variant="body" muted>
            Bu ay kayıt yok.
          </AppText>
        ) : (
          report.byCategory.slice(0, 8).map((c) => (
            <View key={c.category.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityLabel={`${c.category.name} ${formatTL(c.amount)}`}>
              <CategoryBadge category={c.category} size={30} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="label">{c.category.name}</AppText>
                  <AppText variant="money" style={{ fontSize: 13 }}>
                    {formatTL(c.amount)}
                  </AppText>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.surface2 }}>
                  <View style={{ width: `${Math.max(3, Math.round((c.amount / max) * 100))}%`, height: 6, borderRadius: 3, backgroundColor: c.category.id === 'interest' ? palette.danger : palette.accent }} />
                </View>
              </View>
            </View>
          ))
        )}
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/expenses', params: { month: String(offset) } })} style={{ paddingTop: 4 }}>
          <AppText variant="label" color={palette.accent}>
            Tüm harcamaları gör
          </AppText>
        </Pressable>
      </Surface>

      {subs.length ? (
        <Surface tone="surface2" style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="search" size={18} color={palette.warn} />
            <AppText variant="heading" style={{ flex: 1 }}>
              {subs.length} abonelik · ayda {formatTL(subsTotal)}
            </AppText>
          </View>
          <AppText variant="caption" muted>
            Yılda {formatTL(subsTotal * 12)}. Kullanmadıklarını iptal etmeyi düşün.
          </AppText>
          {subs.map((sub) => (
            <View key={sub.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.surface, borderRadius: 14, padding: 10 }}>
              <CategoryBadge category={sub.category} size={32} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {sub.name}
                </AppText>
                <AppText variant="caption" muted>
                  {sub.source === 'bill' ? 'Fatura olarak takipte' : `${sub.months} aydır, her ayın ~${sub.dayOfMonth}'i`}
                </AppText>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <AppText variant="money">{formatTL(sub.monthly)}</AppText>
                {sub.source === 'detected' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${sub.name} için hatırlatma kur`}
                    onPress={() => {
                      dispatch({ type: 'bill/add', bill: subscriptionToBill(sub, now) });
                      Alert.alert('Abonelik takibe alındı', `${sub.name} her ay ödeme gününden 1 gün önce hatırlatılacak.`);
                    }}
                    hitSlop={6}
                  >
                    <AppText variant="caption" color={palette.accent} style={{ fontFamily: fonts.bodyBold }}>
                      Hatırlat
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </Surface>
      ) : null}

      {split ? (
        <Surface style={{ padding: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="users" size={18} color={palette.info} />
            <AppText variant="heading">Ev bütçesi · {formatTL(split.total)}</AppText>
          </View>
          {split.people.map((p) => (
            <View key={p.name} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="label">{p.name}</AppText>
              <AppText variant="label" muted>
                ödedi {formatTL(p.paid)} · payı {formatTL(p.share)}
              </AppText>
            </View>
          ))}
          {split.settlements.length ? (
            split.settlements.map((x) => (
              <AppText key={`${x.from}-${x.to}`} variant="bodyStrong" color={palette.info}>
                {x.from} → {x.to}: {formatTL(x.amount)}
              </AppText>
            ))
          ) : (
            <AppText variant="caption" muted>
              {split.total ? 'Hesaplar denk.' : 'Bu ay paylaşılan fatura ödenmedi.'}
            </AppText>
          )}
        </Surface>
      ) : null}

      {isPast || now.getDate() >= 25 ? (
        <Surface style={{ padding: 16, gap: 6 }}>
          <AppText variant="heading">{monthName(month)} kapanışı</AppText>
          <AppText variant="label" muted style={{ fontFamily: fonts.body, lineHeight: 20 }}>
            {report.interest === 0
              ? `Bu ay hiç faiz ödemedin. Toplam ${formatTL(report.total)} harcadın${report.byCategory[0] ? `; en büyük kalem ${report.byCategory[0].category.name}` : ''}.`
              : `Bu ay ${formatTL(report.interest)} faiz ve vergi ödedin. Ekstreyi tamamen ödersen gelecek ay bu tutar sıfırlanır.`}
          </AppText>
        </Surface>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable accessibilityRole="button" onPress={() => exportAs('pdf')} style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: palette.button, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="bodyStrong" color={palette.onButton}>
            PDF olarak paylaş
          </AppText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => exportAs('csv')} style={{ flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="bodyStrong">Excel (CSV)</AppText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Factor({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText variant="caption" muted>
        {label}
      </AppText>
      <AppText variant="caption" color={color} style={{ fontFamily: fonts.bodyBold }}>
        {value}
      </AppText>
    </View>
  );
}
