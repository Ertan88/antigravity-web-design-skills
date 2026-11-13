import type { Period } from '@okulpano/shared';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { useNow, type MeToday } from './data.ts';
import { teacherDay } from './day.ts';
import { Text } from './text.tsx';
import { colors, radius, tiles, type TileTone } from './theme.ts';
import { Icon, type IconName } from './ui.tsx';

/*
 * Merkez (yönetici ana sayfası): koyu şeritte o anki dersin halkası ve yana kaydırılan durum kartları.
 */

const GOLD = '#F5B83D';
/** Satır başlığı: okulun verdiği ad (ör. "Öğle arası") yoksa "6. ders" */
const rowLabel = (p: Period) => p.label?.trim() || `${p.no}. ders`;
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Halka: o anki ders (ya da teneffüs) ne kadar kaldıysa o kadar dolu; ortada kalan dakika */
function Ring({ left, size = 96, center, caption }: { left: number; size?: number; center: string; caption: string }) {
  const stroke = 8;
  const r = size / 2 - stroke / 2 - 1;
  const c = size / 2;
  const len = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, left));
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={r} stroke="rgba(255,255,255,0.16)" strokeWidth={stroke} fill="none" />
      {f > 0 && (
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={GOLD}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${len * f} ${len}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      )}
      <SvgText x={c} y={c + 6} textAnchor="middle" fill="#ffffff" fontSize={center.length > 3 ? 20 : 26} fontWeight="800" fontFamily="PlusJakartaSans_800ExtraBold">
        {center}
      </SvgText>
      <SvgText x={c} y={c + 22} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={10} fontWeight="800" fontFamily="PlusJakartaSans_800ExtraBold">
        {caption}
      </SvgText>
    </Svg>
  );
}

const minutes = (sec: number) => Math.max(1, Math.ceil(sec / 60));

/**
 * Koyu şerit: halka yalnızca o anki dersi gösterir (ders ilerledikçe azalır, ortada kalan dakika); yanında dersin saati,
 * teneffüs saati ve sıradaki ders. Teneffüste teneffüsün kalanı; dersler başlamadan ilk ders, bitince son zil.
 */
export function BellStrip({ data }: { data: MeToday }) {
  const now = useNow(30_000);
  const day = teacherDay(data, now);
  if (day.holiday || !day.periods.length) return null;
  const b = day.bell;
  const periods = day.periods;
  const last = periods[periods.length - 1]!;
  const after = (p: Period) => periods.find((x) => toMin(x.start) >= toMin(p.end) && x.no !== p.no) ?? null;
  let ring = { left: 0, center: '–', caption: '' };
  let kicker = '';
  let big = '';
  let gold = '';
  let foot = '';
  if (b.kind === 'lesson') {
    const next = after(b.period);
    ring = { left: b.remainingSec / Math.max(1, b.totalSec), center: String(minutes(b.remainingSec)), caption: 'dk kaldı' };
    kicker = `ŞU AN · ${rowLabel(b.period).toLocaleUpperCase('tr-TR')}`;
    big = `${b.period.start} – ${b.period.end}`;
    gold = next ? `Teneffüs: ${b.period.end}` : `Son zil: ${b.period.end}`;
    foot = next ? `Sıradaki: ${rowLabel(next)} ${next.start}` : 'Bugünün son dersi';
  } else if (b.kind === 'break') {
    ring = { left: b.remainingSec / Math.max(1, b.totalSec), center: String(minutes(b.remainingSec)), caption: 'dk kaldı' };
    kicker = b.isLunch ? 'ÖĞLE ARASI' : 'TENEFFÜS';
    big = `${b.prev.end} – ${b.next.start}`;
    gold = `Sıradaki: ${rowLabel(b.next)} ${b.next.start}`;
    foot = `Son zil ${last.end}`;
  } else if (b.kind === 'before') {
    const m = minutes(b.remainingSec);
    ring = { left: 0, center: m < 100 ? String(m) : b.next.start, caption: m < 100 ? 'dk sonra' : 'ilk ders' };
    kicker = 'DERSLER BAŞLAMADI';
    big = `İlk ders ${b.next.start}`;
    gold = `Son zil ${last.end}`;
  } else {
    ring = { left: 0, center: '✓', caption: 'bitti' };
    kicker = 'DERSLER BİTTİ';
    big = `Son zil ${last.end}`;
    gold = 'İyi akşamlar';
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#0f0e0d', borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: colors.border }}>
      <Ring left={ring.left} center={ring.center} caption={ring.caption} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 11.5, fontWeight: '800', color: 'rgba(255,255,255,0.6)' }} numberOfLines={1}>
          {kicker}
        </Text>
        <Text style={{ fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, color: '#ffffff' }} numberOfLines={1} adjustsFontSizeToFit>
          {big}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: GOLD }} numberOfLines={1}>
          {gold}
        </Text>
        {foot ? (
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginTop: 3 }} numberOfLines={1}>
            {foot}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export interface StatusCard {
  key: string;
  tone: TileTone;
  icon: IconName;
  label: string;
  value: string | number;
  caption: string;
  to: string;
}

/** Yana kaydırılan durum kartları (İzinli, Nöbet, Panolar, Yayında) */
export function StatusCards({ cards }: { cards: StatusCard[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }} style={{ marginHorizontal: -2 }}>
      {cards.map((c) => {
        const t = tiles[c.tone];
        return (
          <Pressable
            key={c.key}
            accessibilityRole="button"
            accessibilityLabel={`${c.label}: ${c.value}, ${c.caption}`}
            onPress={() => router.push(c.to as never)}
            style={({ pressed }) => ({ width: 140, minHeight: 104, borderRadius: radius.lg, padding: 12, backgroundColor: t.bg, opacity: pressed ? 0.8 : 1, borderWidth: c.tone === 'paper' ? 1 : 0, borderColor: colors.border })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={c.icon} size={15} color={t.sub} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: t.sub }}>{c.label}</Text>
            </View>
            <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -1, color: t.fg, marginTop: 4 }}>{c.value}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: t.sub }} numberOfLines={2}>
              {c.caption}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
