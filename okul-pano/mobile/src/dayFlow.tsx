import { periodLabel, type Period } from '@okulpano/shared';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { useNow, type MeToday } from './data.ts';
import { teacherDay } from './day.ts';
import { Text } from './text.tsx';
import { colors, radius, tiles, type TileTone } from './theme.ts';
import { Icon, type IconName } from './ui.tsx';

/*
 * Merkez (yönetici ana sayfası) B tasarımı: koyu şeritte küçük okul saati kadranı (her yay bir ders, sarı şu anki),
 * yana kaydırılan durum kartları ve "Bugünün akışı" zaman çizgisi (geçen dersler soluk ve tek satırda, şu anki ders
 * kırmızı noktalı; boş dersler, sınavlar ve son zil saatine yerleşir).
 */

const GOLD = '#F5B83D';
/** Satır başlığı: okulun verdiği ad (ör. "Öğle arası") yoksa "6. ders" */
const rowLabel = (p: Period) => p.label?.trim() || `${p.no}. ders`;
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Okul günü kadranı: her ders bir yay; geçenler dolu, şu anki sarı, gelecekler soluk */
function Dial({ periods, currentNo, size = 96 }: { periods: Period[]; currentNo: number | null; size?: number }) {
  const stroke = 7;
  const r = size / 2 - stroke;
  const c = size / 2;
  const n = Math.max(1, periods.length);
  const step = 360 / n;
  const gap = n > 1 ? Math.min(8, step * 0.18) : 0;
  const pt = (a: number) => [c + r * Math.cos((a * Math.PI) / 180), c + r * Math.sin((a * Math.PI) / 180)] as const;
  const curIdx = currentNo == null ? -1 : periods.findIndex((p) => p.no === currentNo);
  const doneUntil = curIdx >= 0 ? curIdx : periods.length;
  return (
    <Svg width={size} height={size}>
      {periods.map((p, i) => {
        const a0 = -90 + i * step + gap / 2;
        const a1 = a0 + step - gap;
        const [x0, y0] = pt(a0);
        const [x1, y1] = pt(a1);
        const color = i === curIdx ? GOLD : i < doneUntil ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.18)';
        return <Path key={p.no} d={`M${x0} ${y0} A${r} ${r} 0 ${step - gap > 180 ? 1 : 0} 1 ${x1} ${y1}`} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" />;
      })}
      {currentNo != null && (
        <SvgText x={c} y={c + 8} textAnchor="middle" fill="#ffffff" fontSize={22} fontWeight="800" fontFamily="PlusJakartaSans_800ExtraBold">
          {String(currentNo)}
        </SvgText>
      )}
    </Svg>
  );
}

/** Koyu kadran şeridi: şu anki ders, kalan süre, günün kaçıncı dersi ve son zil */
export function BellStrip({ data }: { data: MeToday }) {
  const now = useNow(30_000);
  const day = teacherDay(data, now);
  if (day.holiday || !day.periods.length) return null;
  const b = day.bell;
  const periods = day.periods;
  const last = periods[periods.length - 1]!;
  const nowMin = Math.floor(day.now.secondsOfDay / 60);
  let kicker = '';
  let big = '';
  let gold = '';
  let currentNo: number | null = null;
  if (b.kind === 'lesson') {
    currentNo = b.period.no;
    kicker = `ŞU AN · ${periodLabel(b.period).toLocaleUpperCase('tr-TR')} (${b.period.start}–${b.period.end})`;
    big = `${Math.max(1, Math.ceil(b.remainingSec / 60))} dk`;
    gold = b.next ? 'sonra teneffüs' : 'sonra son zil';
  } else if (b.kind === 'break') {
    currentNo = null;
    kicker = b.isLunch ? 'ÖĞLE ARASI' : 'TENEFFÜS';
    big = `${Math.max(1, Math.ceil(b.remainingSec / 60))} dk`;
    gold = `sonra ${periodLabel(b.next).toLocaleLowerCase('tr-TR')}`;
  } else if (b.kind === 'before') {
    kicker = 'DERSLER BAŞLAMADI';
    big = b.next.start;
    gold = 'ilk ders';
  } else {
    kicker = 'DERSLER BİTTİ';
    big = last.end;
    gold = 'son zil çaldı';
  }
  const doneCount = periods.filter((p) => toMin(p.end) <= nowMin).length;
  const footer =
    b.kind === 'lesson' ? `${periods.findIndex((p) => p.no === b.period.no) + 1}/${periods.length} ders · son zil ${last.end}` : `${doneCount}/${periods.length} ders bitti · son zil ${last.end}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#0f0e0d', borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: colors.border }}>
      <Dial periods={periods} currentNo={currentNo} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 11.5, fontWeight: '800', color: 'rgba(255,255,255,0.6)' }} numberOfLines={1}>
          {kicker}
        </Text>
        <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -1, color: '#ffffff' }}>{big}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: GOLD }}>{gold}</Text>
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginTop: 3 }} numberOfLines={1}>
          {footer}
        </Text>
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

export interface FlowGap {
  periodNo: number;
  className: string;
  covered: boolean;
}
export interface FlowExam {
  periodNo: number;
  start: string | null;
  label: string;
}

interface FlowRow {
  key: string;
  time: string;
  title: string;
  detail?: string | null;
  state: 'past' | 'now' | 'later';
  extra?: ReactNode;
}

/** Bugünün akışı: zilden; geçen dersler tek satırda toplanır, şu anki ve gelecek dersler boş ders ve sınavlarıyla */
export function DayFlow({ data, gaps, exams, ending, canCover }: { data: MeToday; gaps: FlowGap[]; exams: FlowExam[]; ending: string[]; canCover: boolean }) {
  const now = useNow(30_000);
  const day = teacherDay(data, now);
  if (day.holiday || !day.periods.length) return null;
  const nowMin = Math.floor(day.now.secondsOfDay / 60);
  const periods = day.periods;
  const stateOf = (p: Period): FlowRow['state'] => (toMin(p.end) <= nowMin ? 'past' : toMin(p.start) <= nowMin ? 'now' : 'later');
  const gapText = (no: number) => {
    const g = gaps.filter((x) => x.periodNo === no);
    const open = g.filter((x) => !x.covered);
    if (!g.length) return null;
    return open.length ? `${open.length} boş ders: ${open.map((x) => x.className).join(', ')}` : `${g.length} boş ders görevlendirildi`;
  };
  const examText = (no: number) => {
    const e = exams.filter((x) => x.periodNo === no);
    return e.length ? `Sınav: ${e.map((x) => x.label).join(', ')}` : null;
  };
  const rows: FlowRow[] = [];
  const past = periods.filter((p) => stateOf(p) === 'past');
  if (past.length) {
    const covered = gaps.filter((g) => past.some((p) => p.no === g.periodNo));
    const open = covered.filter((g) => !g.covered).length;
    rows.push({
      key: 'past',
      time: past[0]!.start,
      title: past.length === 1 ? rowLabel(past[0]!) : `${past[0]!.no}.–${past[past.length - 1]!.no}. ders`,
      detail: covered.length ? (open ? `${open} ders görevlendirilmeden geçti` : `${covered.length} boş ders görevlendirildi`) : null,
      state: 'past',
    });
  }
  for (const p of periods.filter((x) => stateOf(x) !== 'past')) {
    const state = stateOf(p);
    const g = gapText(p.no);
    const ex = examText(p.no);
    const openHere = gaps.some((x) => x.periodNo === p.no && !x.covered);
    rows.push({
      key: `p${p.no}`,
      time: p.start,
      title: rowLabel(p),
      detail: [ex, g].filter(Boolean).join(' · ') || null,
      state,
      extra:
        openHere && canCover ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/gorevlendirme')} style={{ alignSelf: 'flex-start', marginTop: 5, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.onPrimary }}>Görevlendir</Text>
          </Pressable>
        ) : null,
    });
  }
  const last = periods[periods.length - 1]!;
  rows.push({
    key: 'end',
    time: last.end,
    title: 'Son zil',
    detail: ending.length ? `${ending.map((t) => `"${t}"`).join(', ')} ${ending.length > 1 ? 'duyuruları' : 'duyurusu'} yayından kalkar` : null,
    state: toMin(last.end) <= nowMin ? 'past' : 'later',
  });

  return (
    <View style={{ paddingLeft: 4 }}>
      {rows.map((r, i) => {
        const nowRow = r.state === 'now';
        return (
          <View key={r.key} style={{ flexDirection: 'row', gap: 10, opacity: r.state === 'past' ? 0.5 : 1 }}>
            <Text style={{ width: 42, textAlign: 'right', fontSize: 12, fontWeight: '800', color: nowRow ? colors.danger : colors.subtle, paddingTop: 2 }}>{r.time}</Text>
            <View style={{ width: 14, alignItems: 'center' }}>
              <View style={{ width: nowRow ? 12 : 9, height: nowRow ? 12 : 9, borderRadius: 6, marginTop: nowRow ? 4 : 5, backgroundColor: nowRow ? colors.danger : colors.borderStrong }} />
              {i < rows.length - 1 && <View style={{ flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 }} />}
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink }}>{r.title}</Text>
              {r.detail ? (
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: r.detail.includes('boş ders:') ? colors.warning : colors.faint, marginTop: 1 }}>{r.detail}</Text>
              ) : null}
              {r.extra}
            </View>
          </View>
        );
      })}
    </View>
  );
}
