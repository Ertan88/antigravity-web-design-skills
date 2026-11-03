import type { Period, Shift } from '@okulpano/shared/bell';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useNow, type MeToday } from './data.ts';
import { dayBellPeriods, teacherDay } from './day.ts';
import { Text } from './text.tsx';
import { colors, tiles, type TileTone } from './theme.ts';
import { Card, Icon } from './ui.tsx';

/*
 * Öğretmenin şu anki ve sıradaki dersi: Ders programım sayfasının üstünde ve yöneticinin Merkez ekranında aynı kart.
 */

export type Lesson = MeToday['lessons'][number];

/** Sınıf renkleri (bento kutuları): haftadaki sınıflara sırayla verilir, aynı sınıf hep aynı renkte */
const TONES: TileTone[] = ['lilac', 'mint', 'sky', 'peach', 'rose', 'sun'];
export const ACCENT: Record<TileTone, string> = { lilac: '#8b5cf6', mint: '#22c55e', sky: '#0ea5e9', peach: '#f97316', rose: '#f43f5e', sun: '#eab308', ink: '#57534e', paper: '#a8a29e' };

export function classTones(lessons: Lesson[]) {
  const classes = [...new Set(lessons.map((l) => l.className))].sort((a, b) => a.localeCompare(b, 'tr'));
  return (className: string): TileTone => TONES[Math.max(0, classes.indexOf(className)) % TONES.length]!;
}

export const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
export const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} sa${min % 60 ? ` ${min % 60} dk` : ''}` : `${min} dk`);
export const shiftOf = (data: Pick<MeToday, 'dualShift'>, l: Lesson): Shift => (data.dualShift && l.shift === 'afternoon' ? 'afternoon' : 'morning');

/** Bir günün ders saatleri ve o saatteki ders (ikili öğretimde vardiya vardiya); arifede yarım gün saatinden sonrası düşer */
export function daySlots(data: MeToday, weekday: number, endsAt?: string | null) {
  const lessons = data.lessons.filter((l) => l.weekday === weekday);
  const shifts: Shift[] = data.dualShift ? [...new Set(lessons.map((l) => shiftOf(data, l)))].sort() : ['morning'];
  return shifts.map((shift) => {
    let periods = dayBellPeriods(data, weekday, shift);
    if (endsAt) periods = periods.filter((p) => p.start < endsAt);
    return { shift, slots: periods.map((period) => ({ period, lesson: lessons.find((l) => l.periodNo === period.no && shiftOf(data, l) === shift) })) };
  });
}

type Slot = { period: Period; lesson: Lesson };

/** Şu anki ders (art arda aynı dersin kaçıncı saati) ve sıradaki ders */
export function liveLesson(data: MeToday, now: Date) {
  const today = teacherDay(data, now);
  if (today.holiday || today.now.weekday > 7) return null;
  const nowMin = Math.floor(today.now.secondsOfDay / 60);
  const slots = daySlots(data, today.now.weekday, today.endsAt).flatMap((s) => s.slots.filter((x): x is Slot => Boolean(x.lesson)));
  const same = (a: Slot, b: Slot) => a.lesson.className === b.lesson.className && a.lesson.subject === b.lesson.subject;
  const i = slots.findIndex((s) => toMin(s.period.start) <= nowMin && nowMin < toMin(s.period.end));
  const current = i >= 0 ? slots[i]! : null;
  let run: { index: number; total: number } | null = null;
  if (current) {
    let a = i;
    let b = i;
    while (a > 0 && same(slots[a - 1]!, current) && slots[a - 1]!.period.no === slots[a]!.period.no - 1) a--;
    while (b < slots.length - 1 && same(slots[b + 1]!, current) && slots[b + 1]!.period.no === slots[b]!.period.no + 1) b++;
    run = { index: i - a + 1, total: b - a + 1 };
  }
  const next = slots.find((s) => toMin(s.period.start) > nowMin) ?? null;
  return { nowMin, current, run, next, any: slots.length > 0 };
}

/** Şu anki ders kartı; derste değilken sıradaki ders. Merkez'de dokununca Ders programım açılır */
export function LiveLesson({ data, link }: { data: MeToday; link?: boolean }) {
  const now = useNow(30_000);
  const live = data.teacher ? liveLesson(data, now) : null;
  if (!live) return null;
  const toneOf = classTones(data.lessons);
  const body = (
    <View style={{ gap: 10 }}>
      {live.current && <NowCard slot={live.current} run={live.run!} nowMin={live.nowMin} tone={toneOf(live.current.lesson.className)} />}
      {live.next && <NextCard slot={live.next} nowMin={live.nowMin} soon={!live.current} tone={toneOf(live.next.lesson.className)} />}
    </View>
  );
  if (!live.current && !live.next) return null;
  return link ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Ders programım" onPress={() => router.push('/programim')}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

function NowCard({ slot, run, nowMin, tone }: { slot: Slot; run: { index: number; total: number }; nowMin: number; tone: TileTone }) {
  const t = tiles[tone];
  const { period, lesson } = slot;
  const start = toMin(period.start);
  const end = toMin(period.end);
  const left = Math.max(0, end - nowMin);
  const progress = Math.min(1, Math.max(0, (nowMin - start) / (end - start)));
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 26, padding: 18, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12.5, fontWeight: '800', color: t.sub, letterSpacing: 0.4 }}>ŞU AN · {period.no}. DERS</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#fff' }}>derste</Text>
        </View>
      </View>
      <Text style={{ fontSize: 24, fontWeight: '800', color: t.fg, letterSpacing: -0.6, marginTop: 6 }}>{lesson.subject}</Text>
      <Text style={{ fontSize: 14.5, fontWeight: '700', color: t.sub }}>
        {lesson.className}
        {run.total > 1 ? ` · ${run.total} saatlik dersin ${run.index}. saati` : ''}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <Text style={{ fontSize: 40, fontWeight: '800', color: t.fg, letterSpacing: -1.5 }}>{left}</Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: t.sub }}>dk kaldı</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(127,127,127,0.25)', overflow: 'hidden', marginTop: 6 }}>
        <View style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 4, backgroundColor: ACCENT[tone] }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: t.sub }}>{period.start}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: t.sub }}>{period.end}</Text>
      </View>
    </View>
  );
}

function NextCard({ slot, nowMin, soon, tone }: { slot: Slot; nowMin: number; soon: boolean; tone: TileTone }) {
  const { period, lesson } = slot;
  const inMin = toMin(period.start) - nowMin;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: soon ? 16 : 12 }}>
      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: tiles[tone].bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="arrow-forward" size={18} color={tiles[tone].fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.faint, letterSpacing: 0.3 }}>
          SIRADAKİ · {period.start} · {period.no}. ders{soon ? ` · ${duration(inMin)} sonra` : ''}
        </Text>
        <Text style={{ fontSize: soon ? 17 : 15.5, fontWeight: '800', color: colors.ink }} numberOfLines={2}>
          {lesson.className} · {lesson.subject}
        </Text>
      </View>
    </Card>
  );
}
