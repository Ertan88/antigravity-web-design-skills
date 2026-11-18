import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTL } from '../../core/money';
import { dueLabel, formatLongDate, greetingFor, Urgency, urgencyFor } from '../../core/schedule';
import { useNotifications } from '../../notifications/NotificationsProvider';
import { markBillPaid } from '../../features/markPaid';
import { buildInbox, unreadCount } from '../../notifications/plan';
import { healthReport } from '../../store/analytics';
import { demoState } from '../../store/demoSeed';
import { DueItem, homeSummary } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts, Palette, radius } from '../../theme/tokens';
import { Icon } from '../../ui/icons';
import { AppText, CategoryBadge, Chip, IconButton, PrimaryButton, ScoreRing, Surface } from '../../ui/primitives';

const RENT_COLOR = '#FF8FB8';

function urgencyStyle(u: Urgency, p: Palette) {
  switch (u) {
    case 'overdue':
      return { fg: p.danger, bg: p.dangerBg, border: p.danger, glow: true };
    case 'today':
    case 'soon':
      return { fg: p.warn, bg: p.warnBg, border: p.warn, glow: true };
    case 'upcoming':
      return { fg: p.info, bg: p.infoBg, border: p.line, glow: false };
    default:
      return { fg: p.muted, bg: p.surface2, border: p.line, glow: false };
  }
}

function splitMoney(text: string) {
  const i = text.lastIndexOf(',');
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i)];
}

export default function HomeScreen() {
  const { palette } = useTheme();
  const { state, dispatch } = useStore();
  const { permission, request } = useNotifications();
  const insets = useSafeAreaInsets();
  const now = useMemo(() => new Date(), []);
  const s = useMemo(() => homeSummary(state, now), [state, now]);
  const health = useMemo(() => healthReport(state, now), [state, now]);
  const unread = useMemo(() => unreadCount(buildInbox(state, now), state.settings.inboxSeenAt), [state, now]);
  const [whole, cents] = splitMoney(formatTL(s.monthTotal));
  const g = s.byGroup;

  const openProfile = () => router.push('/settings');

  const onItemPress = (item: DueItem) => {
    if (item.kind === 'card') return router.push(`/card/${item.refId}`);
    Alert.alert(item.title, `${formatTL(item.amount)} · ${dueLabel(item.daysLeft)}`, [
      { text: 'Ödedim', onPress: () => item.period && markBillPaid(state, dispatch, item.refId, item.period) },
      { text: 'Düzenle', onPress: () => router.push({ pathname: '/add', params: { billId: item.refId } }) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 32, gap: 16 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <AppText variant="label" muted style={{ fontFamily: fonts.body }}>
            {formatLongDate(now)}
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            {greetingFor(now)}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <IconButton icon="bell" label={unread ? `Bildirimler, ${unread} yeni` : 'Bildirimler'} onPress={() => router.push('/notifications')} badge={unread > 0} />
          <IconButton icon="user" label="Profil ve ayarlar" onPress={openProfile} />
        </View>
      </View>

      {s.isEmpty ? (
        <EmptyState onDemo={() => dispatch({ type: 'hydrate', state: demoState(new Date()) })} />
      ) : (
        <>
          {permission === 'undetermined' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => request()}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.warnBg, borderRadius: 18, padding: 14 }}
            >
              <Icon name="bell" size={22} color={palette.warn} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">Hatırlatmaları aç</AppText>
                <AppText variant="caption" muted>
                  Son ödeme günlerinde, seçtiğin saatte bildirim gelsin.
                </AppText>
              </View>
              <Icon name="chevronRight" size={18} color={palette.muted} />
            </Pressable>
          ) : null}

          <Surface style={{ padding: 18, gap: 12, borderRadius: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="label" muted>
                Bu ay ödenecek
              </AppText>
              <Chip text={s.interestThisMonth > 0 ? '≈ faiz dahil tahmini' : '≈ tahmini'} color={palette.warn} background={palette.warnBg} />
            </View>
            <AppText variant="display" accessibilityLabel={`Bu ay ödenecek ${formatTL(s.monthTotal)}`}>
              {whole}
              <AppText variant="title" muted>
                {cents}
              </AppText>
            </AppText>
            {s.monthTotal > 0 ? (
              <View style={{ flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', gap: 3 }}>
                {g.cards > 0 ? <View style={{ flex: g.cards, backgroundColor: palette.info }} /> : null}
                {g.bills > 0 ? <View style={{ flex: g.bills, backgroundColor: palette.warn }} /> : null}
                {g.rent > 0 ? <View style={{ flex: g.rent, backgroundColor: RENT_COLOR }} /> : null}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {(
                [
                  ['Kartlar', g.cards, palette.info],
                  ['Fatura', g.bills, palette.warn],
                  ['Kira', g.rent, RENT_COLOR],
                ] as const
              ).map(([label, amount, color]) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
                  <AppText variant="caption" muted>
                    {label} {formatTL(amount).replace(/,\d\d$/, '')}
                  </AppText>
                </View>
              ))}
            </View>
          </Surface>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable accessibilityRole="button" onPress={() => router.navigate('/reports')} style={{ flex: 1 }}>
              <Surface style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20 }}>
                <ScoreRing score={health.score} />
                <View style={{ flexShrink: 1 }}>
                  <AppText variant="caption" muted>
                    Ödeme sağlığı
                  </AppText>
                  <AppText variant="bodyStrong" color={s.overdueCount || health.score < 50 ? palette.danger : health.score < 70 ? palette.warn : palette.accent}>
                    {s.overdueCount ? `${s.overdueCount} gecikme` : health.label}
                  </AppText>
                </View>
              </Surface>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate('/cards')}
              style={{ flex: 1, backgroundColor: s.interestThisMonth ? palette.dangerBg : palette.surface, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: palette.line }}
            >
              <AppText variant="caption" muted>
                Bu ay faiz (tahmini)
              </AppText>
              <AppText variant="title" color={s.interestThisMonth ? palette.danger : palette.accent} style={{ fontSize: 22 }}>
                {formatTL(s.interestThisMonth)}
              </AppText>
              <AppText variant="caption" muted style={{ fontSize: 11 }}>
                KKDF + BSMV dahil
              </AppText>
            </Pressable>
          </View>

          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <AppText variant="heading" accessibilityRole="header">
                Yaklaşan ödemeler
              </AppText>
              <Pressable accessibilityRole="link" onPress={() => router.navigate('/timeline')} hitSlop={8}>
                <AppText variant="label" color={palette.accent}>
                  Akışı gör
                </AppText>
              </Pressable>
            </View>
            {s.upcoming.length === 0 ? (
              <AppText variant="body" muted>
                Yaklaşan ödeme yok.
              </AppText>
            ) : (
              s.upcoming.map((p) => <PaymentRow key={p.key} item={p} onPress={() => onItemPress(p)} />)
            )}
          </View>

          <Pressable accessibilityRole="button" accessibilityHint="Harcama geçmişini açar" onPress={() => router.push('/expenses')}>
          <Surface tone="surface2" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingHorizontal: 14, borderRadius: 18 }}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" muted>
                Bugün harcadın
              </AppText>
              <AppText variant="money" style={{ fontSize: 18 }}>
                {formatTL(s.todayTotal)}
              </AppText>
            </View>
            {s.today.slice(0, 4).map((t) => (
              <View key={t.category.id} accessible accessibilityLabel={`${t.category.name} ${formatTL(t.amount)}`}>
                <CategoryBadge category={t.category} size={36} />
              </View>
            ))}
          </Surface>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function EmptyState({ onDemo }: { onDemo: () => void }) {
  const { palette } = useTheme();
  const actions = [
    { label: 'İlk faturanı ekle', icon: 'doc' as const, onPress: () => router.push({ pathname: '/add', params: { tab: 'bill' } }) },
    { label: 'Kredi kartı ekle', icon: 'card' as const, onPress: () => router.push('/card-new') },
    { label: 'Günlük harcama gir', icon: 'cart' as const, onPress: () => router.push({ pathname: '/add', params: { tab: 'daily' } }) },
  ];
  return (
    <Surface style={{ padding: 20, gap: 14, borderRadius: 24 }}>
      <Icon name="logo" size={32} color={palette.accent} strokeWidth={2.2} />
      <AppText variant="title">Akışını kuralım</AppText>
      <AppText variant="body" muted>
        Faturalarını, kartlarını ve harcamalarını ekle. Son ödeme günlerini ve kart faizini PayFlow takip etsin.
      </AppText>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          accessibilityRole="button"
          onPress={a.onPress}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: palette.surface2 }}
        >
          <Icon name={a.icon} size={20} color={palette.accent} />
          <AppText variant="bodyStrong" style={{ flex: 1 }}>
            {a.label}
          </AppText>
          <Icon name="chevronRight" size={18} color={palette.muted} />
        </Pressable>
      ))}
      <PrimaryButton title="Örnek verilerle dene" onPress={onDemo} />
    </Surface>
  );
}

function PaymentRow({ item, onPress }: { item: DueItem; onPress: () => void }) {
  const { palette } = useTheme();
  const u = urgencyStyle(urgencyFor(item.daysLeft), palette);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${formatTL(item.amount)}, ${dueLabel(item.daysLeft)}`}
      accessibilityHint={item.kind === 'card' ? 'Kart ve ekstre ayrıntısını açar' : 'Ödendi işaretle veya düzenle'}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: palette.surface,
        borderColor: u.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        paddingVertical: 12,
        paddingHorizontal: 14,
        opacity: pressed ? 0.8 : 1,
        shadowColor: u.glow ? u.fg : 'transparent',
        shadowOpacity: u.glow ? 0.35 : 0,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
        elevation: u.glow ? 4 : 0,
      })}
    >
      <CategoryBadge category={item.category} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {item.title}
        </AppText>
        <AppText variant="caption" muted numberOfLines={1}>
          {item.subtitle}
        </AppText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <AppText variant="money">{formatTL(item.amount)}</AppText>
        <Chip text={dueLabel(item.daysLeft)} color={u.fg} background={u.bg} />
      </View>
    </Pressable>
  );
}
