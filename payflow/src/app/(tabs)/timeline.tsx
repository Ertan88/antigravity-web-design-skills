import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { monthName, sameDay } from '../../core/dates';
import { formatTL } from '../../core/money';
import { formatShortDate } from '../../core/schedule';
import { useStore } from '../../store/StoreProvider';
import { currentBalance, findShortfall, FlowEvent, flowEvents, withBalances } from '../../store/timeline';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts, Palette } from '../../theme/tokens';
import { Segmented } from '../../ui/form';
import { Icon } from '../../ui/icons';
import { AppText, CategoryBadge, IconButton, Surface } from '../../ui/primitives';

const W = 320;
const H = 64;

/** Zaman Nehri: önümüzdeki 30/60 günün ödemeleri, maaşlar ve tahmini bakiye. */
export default function TimelineScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { state } = useStore();
  const now = useMemo(() => new Date(), []);
  const [days, setDays] = useState<'30' | '60'>('30');

  const start = currentBalance(state);
  const raw = useMemo(() => flowEvents(state, now, Number(days)), [state, now, days]);
  const events = useMemo(() => (start === null ? raw : withBalances(raw, start)), [raw, start]);
  const shortfall = useMemo(() => (start === null ? null : findShortfall(state, events)), [state, events, start]);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(days));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 32, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <AppText variant="label" muted style={{ fontFamily: fonts.body }}>
            {monthName(now)} → {monthName(end)}
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            Akış
          </AppText>
        </View>
        <View style={{ width: 150 }}>
          <Segmented label="Aralık" value={days} onChange={setDays} options={[{ value: '30', label: '30 gün' }, { value: '60', label: '60 gün' }]} />
        </View>
        <IconButton icon="wallet" label="Bakiye ve maaş ayarları" onPress={() => router.push('/flow-settings')} />
      </View>

      {start === null ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/flow-settings')}>
          <Surface style={{ padding: 16, gap: 6 }}>
            <AppText variant="bodyStrong">Bakiye çizgisini aç</AppText>
            <AppText variant="label" muted style={{ fontFamily: fonts.body }}>
              Mevcut hesap bakiyeni ve maaşını gir; hangi gün bakiyenin eksiye düşeceğini önceden gösterelim.
            </AppText>
            <AppText variant="label" color={palette.accent}>
              Bakiye ve maaş gir
            </AppText>
          </Surface>
        </Pressable>
      ) : (
        <Surface style={{ padding: 14, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" muted>
              Tahmini bakiye
            </AppText>
            <AppText variant="caption" muted>
              bugün <AppText variant="caption" style={{ fontFamily: fonts.bodyBold }}>{formatTL(start)}</AppText>
            </AppText>
          </View>
          <BalanceLine events={events} start={start} now={now} days={Number(days)} palette={palette} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" muted>
              {formatShortDate(now)}
            </AppText>
            {shortfall ? (
              <AppText variant="caption" color={palette.danger}>
                {formatShortDate(shortfall.date)}
              </AppText>
            ) : null}
            <AppText variant="caption" muted>
              {formatShortDate(end)}
            </AppText>
          </View>
        </Surface>
      )}

      {shortfall ? (
        <View style={{ flexDirection: 'row', gap: 12, backgroundColor: palette.dangerBg, borderColor: palette.danger, borderWidth: 1, borderRadius: 18, padding: 14 }}>
          <Icon name="alert" size={22} color={palette.danger} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="bodyStrong">
              {formatShortDate(shortfall.date)}'da bakiye eksiye düşüyor ({formatTL(shortfall.lowest)})
            </AppText>
            <AppText variant="label" muted style={{ fontFamily: fonts.body, lineHeight: 19 }}>
              {shortfall.suggestion
                ? `${shortfall.suggestion.cardTitle} ödemesinin ${formatTL(shortfall.suggestion.defer)}'sini maaştan sonraya bırakmak ≈ ${formatTL(shortfall.suggestion.cost)} faiz demek. Asgarinin üzerinde kalırsın.`
                : 'Maaş gününe kadar tampon yetersiz. Bir ödemeyi ertelemeyi ya da harcamayı kısmayı düşün.'}
            </AppText>
          </View>
        </View>
      ) : null}

      {events.length === 0 ? (
        <AppText variant="body" muted>
          Bu aralıkta ödeme yok.
        </AppText>
      ) : (
        <View accessibilityRole="list">
          {events.map((e, i) => (
            <EventRow key={e.key} e={e} first={i === 0 || !sameDay(events[i - 1].date, e.date)} palette={palette} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function EventRow({ e, first, palette }: { e: FlowEvent; first: boolean; palette: Palette }) {
  const neg = (e.balanceAfter ?? 0) < 0;
  const income = e.amount > 0;
  const onPress = !e.refId
    ? undefined
    : e.kind === 'card'
      ? () => router.push(`/card/${e.refId}`)
      : e.kind === 'salary'
        ? () => router.push({ pathname: '/income-log', params: { id: e.refId!, period: e.period! } })
        : () => router.push(`/bill/${e.refId}`);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${formatShortDate(e.date)}, ${e.title}, ${formatTL(e.amount)}${e.balanceAfter !== undefined ? `, bakiye ${formatTL(e.balanceAfter)}` : ''}`}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10, minHeight: 56 }}
    >
      <View style={{ width: 40, justifyContent: 'center', alignItems: 'flex-end' }}>
        {first ? (
          <>
            <AppText variant="money" color={neg ? palette.danger : palette.text}>
              {e.date.getDate()}
            </AppText>
            <AppText variant="caption" muted style={{ fontSize: 10 }}>
              {monthName(e.date).slice(0, 3).toLocaleUpperCase('tr-TR')}
            </AppText>
          </>
        ) : null}
      </View>
      <View style={{ width: 18, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: neg ? palette.danger : palette.surface2 }} />
        <View style={{ width: income ? 14 : 10, height: income ? 14 : 10, borderRadius: 7, backgroundColor: income ? palette.accent : neg ? palette.danger : palette.info, borderWidth: 3, borderColor: palette.bg }} />
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <CategoryBadge category={e.category} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 14 }}>
            {e.title}
          </AppText>
          {e.projected ? (
            <AppText variant="caption" muted style={{ fontSize: 11 }}>
              {income ? 'tahmini · yatınca tutarı gir' : 'tahmini'}
            </AppText>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="money" color={income ? palette.accent : palette.text} style={{ fontSize: 14 }}>
            {income ? '+' : ''}
            {formatTL(e.amount)}
          </AppText>
          {e.balanceAfter !== undefined ? (
            <AppText variant="caption" color={neg ? palette.danger : palette.muted} style={{ fontSize: 11 }}>
              {formatTL(e.balanceAfter)}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Basamaklı bakiye çizgisi; sıfırın altı mercan renkte. */
function BalanceLine({ events, start, now, days, palette }: { events: FlowEvent[]; start: number; now: Date; days: number; palette: Palette }) {
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const span = days * 86_400_000;
  const pts: [number, number][] = [[0, start]];
  for (const e of events) {
    const x = Math.min(1, (e.date.getTime() - t0) / span);
    pts.push([x, pts[pts.length - 1][1]], [x, e.balanceAfter ?? 0]);
  }
  pts.push([1, pts[pts.length - 1][1]]);
  const values = pts.map((p) => p[1]);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const y = (v: number) => H - 4 - ((v - min) / (max - min || 1)) * (H - 8);
  const toXY = (p: [number, number]) => `${(p[0] * W).toFixed(1)},${y(p[1]).toFixed(1)}`;
  const negSegs: string[] = [];
  for (let i = 1; i < pts.length; i++) if (pts[i][1] < 0 && pts[i - 1][1] < 0) negSegs.push(`${toXY(pts[i - 1])} ${toXY(pts[i])}`);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Bakiye çizgisi, en düşük ${formatTL(min)}`}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke={palette.muted} strokeWidth={1} strokeDasharray="3 4" opacity={0.6} />
        <Polyline points={pts.map(toXY).join(' ')} fill="none" stroke={palette.accent} strokeWidth={2.5} strokeLinejoin="round" />
        {negSegs.map((seg, i) => (
          <Polyline key={i} points={seg} fill="none" stroke={palette.danger} strokeWidth={3.5} />
        ))}
        <Circle cx={3} cy={y(start)} r={4} fill={palette.accent} />
      </Svg>
    </View>
  );
}
