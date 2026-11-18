import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTL } from '../../core/money';
import { daysUntil, dueLabel, formatLongDate, greetingFor, Urgency, urgencyFor } from '../../core/schedule';
import { buildDemoSummary, UpcomingPayment } from '../../data/demo';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts, Palette, radius } from '../../theme/tokens';
import { AppText, CategoryBadge, Chip, IconButton, ScoreRing, Surface } from '../../ui/primitives';

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
  const insets = useSafeAreaInsets();
  const now = useMemo(() => new Date(), []);
  const s = useMemo(() => buildDemoSummary(now), [now]);
  const [whole, cents] = splitMoney(formatTL(s.monthTotal));
  const g = s.byGroup;

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
          <IconButton icon="bell" label="Bildirimler" badge />
          <IconButton icon="user" label="Profil" />
        </View>
      </View>

      <Surface style={{ padding: 18, gap: 12, borderRadius: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="label" muted>
            Bu ay ödenecek
          </AppText>
          <Chip text="≈ faiz dahil tahmini" color={palette.warn} background={palette.warnBg} />
        </View>
        <AppText variant="display" accessibilityLabel={`Bu ay ödenecek ${formatTL(s.monthTotal)}`}>
          {whole}
          <AppText variant="title" muted>
            {cents}
          </AppText>
        </AppText>
        <View style={{ flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', gap: 3 }}>
          <View style={{ flex: g.cards, backgroundColor: palette.info }} />
          <View style={{ flex: g.bills, backgroundColor: palette.warn }} />
          <View style={{ flex: g.rent, backgroundColor: RENT_COLOR }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {[
            ['Kartlar', g.cards, palette.info],
            ['Fatura', g.bills, palette.warn],
            ['Kira', g.rent, RENT_COLOR],
          ].map(([label, amount, color]) => (
            <View key={label as string} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color as string }} />
              <AppText variant="caption" muted>
                {label} {formatTL(amount as number).replace(/,\d\d$/, '')}
              </AppText>
            </View>
          ))}
        </View>
      </Surface>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/reports')} style={{ flex: 1 }}>
          <Surface style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20 }}>
            <ScoreRing score={s.healthScore} />
            <View style={{ flexShrink: 1 }}>
              <AppText variant="caption" muted>
                Ödeme sağlığı
              </AppText>
              <AppText variant="bodyStrong" color={palette.accent}>
                İyi gidiyor
              </AppText>
            </View>
          </Surface>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/cards')}
          style={{ flex: 1, backgroundColor: palette.dangerBg, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: palette.line }}
        >
          <AppText variant="caption" muted>
            Bu ay faiz (tahmini)
          </AppText>
          <AppText variant="title" color={palette.danger} style={{ fontSize: 22 }}>
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
        {s.upcoming.map((p) => (
          <PaymentRow key={p.id} payment={p} now={now} />
        ))}
      </View>

      <Surface tone="surface2" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingHorizontal: 14, borderRadius: 18 }}>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" muted>
            Bugün harcadın
          </AppText>
          <AppText variant="money" style={{ fontSize: 18 }}>
            {formatTL(s.todayTotal)}
          </AppText>
        </View>
        {s.today.map((t) => (
          <View key={t.category.id} accessible accessibilityLabel={`${t.category.name} ${formatTL(t.amount)}`}>
            <CategoryBadge category={t.category} size={36} />
          </View>
        ))}
      </Surface>
    </ScrollView>
  );
}

function PaymentRow({ payment, now }: { payment: UpcomingPayment; now: Date }) {
  const { palette } = useTheme();
  const days = daysUntil(payment.due, now);
  const u = urgencyStyle(urgencyFor(days), palette);
  return (
    <View
      accessible
      accessibilityLabel={`${payment.title}, ${formatTL(payment.amount)}, ${dueLabel(days)}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: palette.surface,
        borderColor: u.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        paddingVertical: 12,
        paddingHorizontal: 14,
        // "nefes alan" aciliyet parıltısı — Adım 4'te animasyonlu hale gelecek
        shadowColor: u.glow ? u.fg : 'transparent',
        shadowOpacity: u.glow ? 0.35 : 0,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
        elevation: u.glow ? 4 : 0,
      }}
    >
      <CategoryBadge category={payment.category} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {payment.title}
        </AppText>
        <AppText variant="caption" muted numberOfLines={1}>
          {payment.subtitle}
        </AppText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <AppText variant="money">{formatTL(payment.amount)}</AppText>
        <Chip text={dueLabel(days)} color={u.fg} background={u.bg} />
      </View>
    </View>
  );
}
