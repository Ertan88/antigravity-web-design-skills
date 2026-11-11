import type { Period, Shift } from '@okulpano/shared/bell';
import { router } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useNow, type MeToday } from './data.ts';
import { classDayPeriods, classLabel, dateOfWeekday, dayBellPeriods, greeting, teacherDay } from './day.ts';
import { Text } from './text.tsx';
import { colors, tiles, type TileTone } from './theme.ts';
import { Card, Icon } from './ui.tsx';

/*
 * Öğretmenin şu anki ve sıradaki dersi: Ders programım sayfasının üstünde ve yöneticinin Merkez ekranında aynı kart.
 */

export type Lesson = MeToday['lessons'][number];

/**
 * Sınıf renkleri (bento kutuları): haftadaki sınıflara sırayla verilir, aynı sınıf hep aynı renkte. Turuncu (peach) nöbet
 * kartına ayrılmıştır; şu anki ders kartı nöbet kartıyla aynı renge düşmesin diye sınıflara verilmez.
 */
const TONES: TileTone[] = ['lilac', 'mint', 'sky', 'rose', 'sun'];
export const ACCENT: Record<TileTone, string> = { lilac: '#8b5cf6', mint: '#22c55e', sky: '#0ea5e9', peach: '#f97316', rose: '#f43f5e', sun: '#eab308', ink: '#57534e', paper: '#a8a29e' };

export function classTones(lessons: Lesson[]) {
  const classes = [...new Set(lessons.map((l) => l.className))].sort((a, b) => a.localeCompare(b, 'tr'));
  return (className: string): TileTone => TONES[Math.max(0, classes.indexOf(className)) % TONES.length]!;
}

export const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
export const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} sa${min % 60 ? ` ${min % 60} dk` : ''}` : `${min} dk`);
export const shiftOf = (data: Pick<MeToday, 'dualShift'>, l: Lesson): Shift => (data.dualShift && l.shift === 'afternoon' ? 'afternoon' : 'morning');

/**
 * Bir günün ders saatleri ve o saatteki ders (ikili öğretimde vardiya vardiya); arifede yarım gün saatinden sonrası düşer.
 * Sınıfa özel zile geçen sınıftaki dersin saati o zilden gelir (ör. 12. sınıfların 11 dersli günü); tarih verilmezse
 * bu haftanın o günü.
 */
export function daySlots(data: MeToday, weekday: number, endsAt?: string | null, date?: string) {
  const day = date ?? dateOfWeekday(data.today, weekday);
  const lessons = data.lessons.filter((l) => l.weekday === weekday);
  const shifts: Shift[] = data.dualShift ? [...new Set(lessons.map((l) => shiftOf(data, l)))].sort() : ['morning'];
  return shifts.map((shift) => {
    const school = dayBellPeriods(data, weekday, shift, day);
    const mine = lessons.filter((l) => shiftOf(data, l) === shift);
    const slots = new Map<number, { period: Period; lesson?: Lesson }>(school.map((p) => [p.no, { period: p }]));
    for (const l of mine) {
      const period = classDayPeriods(data, day, l.classId, shift).find((p) => p.no === l.periodNo);
      if (period) slots.set(l.periodNo, { period, lesson: l });
    }
    const list = [...slots.values()]
      .filter((x) => !endsAt || x.period.start < endsAt)
      .sort((a, b) => toMin(a.period.start) - toMin(b.period.start) || a.period.no - b.period.no);
    return { shift, slots: list };
  });
}

type Slot = { period: Period; lesson: Lesson };

/** Canlı göstergesi: beyaz nokta yavaşça yanıp söner */
function PulseDot() {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.2, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff', opacity: v }} />;
}

/** Şu anki ders (art arda aynı dersin kaçıncı saati) ve sıradaki ders */
export function liveLesson(data: MeToday, now: Date) {
  const today = teacherDay(data, now);
  if (today.holiday || today.now.weekday > 7) return null;
  const nowMin = Math.floor(today.now.secondsOfDay / 60);
  const slots = daySlots(data, today.now.weekday, today.endsAt, today.now.isoDate).flatMap((s) => s.slots.filter((x): x is Slot => Boolean(x.lesson)));
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

/**
 * Şu an kartı (bütün kullanıcıların ana ekranında ve Ders programım'da aynı): kendi dersi varsa ders, sınıf, kalan süre;
 * yoksa okulun zili (ders saati, teneffüs, derslerden önce). Altında sıradaki kendi dersi. Tatilde ve okul bitince görünmez.
 */
export function LiveLesson({ data, link }: { data: MeToday; link?: boolean }) {
  const now = useNow(30_000);
  const day = teacherDay(data, now);
  if (day.holiday) return null;
  const live = liveLesson(data, now);
  const toneOf = classTones(data.lessons);
  const nowMin = Math.floor(day.now.secondsOfDay / 60);
  const bell = day.bell;
  const hasLessons = data.teacher && data.lessons.length > 0;
  let main: ReactNode = null;
  if (live?.current) {
    const { period, lesson } = live.current;
    main = (
      <BigCard
        tone={toneOf(lesson.className)}
        kicker={`ŞU AN · ${period.no}. DERS`}
        badge="Derste"
        title={lesson.subject}
        subtitle={`${classLabel(lesson.className)}${live.run!.total > 1 ? ` · ${live.run!.total} saatlik dersin ${live.run!.index}. saati` : ''}`}
        left={toMin(period.end) - nowMin}
        caption="dk kaldı"
        from={period.start}
        to={period.end}
        nowMin={nowMin}
      />
    );
  } else if (bell.kind === 'lesson') {
    main = (
      <BigCard
        tone="paper"
        kicker={`ŞU AN · ${bell.period.no}. DERS`}
        title={hasLessons ? 'Boş saatiniz' : 'Ders saati'}
        subtitle={`Okulda ${bell.period.no}. ders sürüyor`}
        left={Math.ceil(bell.remainingSec / 60)}
        caption={bell.next ? 'dk sonra teneffüs' : 'dk sonra dersler biter'}
        from={bell.period.start}
        to={bell.period.end}
        nowMin={nowMin}
      />
    );
  } else if (bell.kind === 'break') {
    main = (
      <BigCard
        tone="sun"
        kicker={bell.isLunch ? 'ŞU AN · ÖĞLE ARASI' : 'ŞU AN · TENEFFÜS'}
        title={bell.isLunch ? 'Öğle arası' : 'Teneffüs'}
        subtitle={`${bell.next.no}. ders ${bell.next.start}'de başlar`}
        left={Math.ceil(bell.remainingSec / 60)}
        caption="dk sonra ders"
        from={bell.prev.end}
        to={bell.next.start}
        nowMin={nowMin}
      />
    );
  } else if (bell.kind === 'before' && bell.remainingSec <= 3 * 3600) {
    // İlk dersten en çok 3 saat önce (gece görünmez); başlık vakte göre karşılama
    main = (
      <BigCard
        tone="sky"
        kicker="DERSLERDEN ÖNCE"
        title={greeting(new Date().getHours())}
        subtitle={`İlk ders ${bell.next.start}'de başlar`}
      />
    );
  }
  const next = live?.next ?? null;
  if (!main && !next) return null;
  const body = (
    <View style={{ gap: 10 }}>
      {main}
      {next && <NextCard slot={next} nowMin={nowMin} soon={!live?.current} tone={toneOf(next.lesson.className)} />}
    </View>
  );
  return link && hasLessons ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Ders programım" onPress={() => router.push('/programim')}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Büyük kart: üst etiket, başlık, alt satır, kalan dakika ve (varsa) ilerleme çubuğu */
function BigCard(p: {
  tone: TileTone;
  kicker: string;
  badge?: string;
  title: string;
  subtitle: string;
  left?: number;
  caption?: string;
  from?: string;
  to?: string;
  nowMin?: number;
}) {
  const t = tiles[p.tone];
  const paper = p.tone === 'paper';
  const progress = p.from && p.to && p.nowMin !== undefined ? Math.min(1, Math.max(0, (p.nowMin - toMin(p.from)) / Math.max(1, toMin(p.to) - toMin(p.from)))) : null;
  const left = Math.max(0, p.left ?? 0);
  // Bir saatten uzunsa "1 sa 15" + "dk sonra …", tam saatse "2 sa" + "sonra …"
  const h = Math.floor(left / 60);
  const m = left % 60;
  const big = h ? `${h} sa${m ? ` ${m}` : ''}` : String(left);
  const caption = p.caption && h && !m ? p.caption.replace(/^dk /, '') : p.caption;
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 26, padding: 18, gap: 4, borderWidth: paper ? 1 : 0, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12.5, fontWeight: '800', color: t.sub, letterSpacing: 0.4 }}>{p.kicker}</Text>
        {p.badge && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
            <PulseDot />
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#fff' }}>{p.badge}</Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 24, fontWeight: '800', color: t.fg, letterSpacing: -0.6, marginTop: 6 }}>{p.title}</Text>
      <Text style={{ fontSize: 14.5, fontWeight: '700', color: t.sub }}>{p.subtitle}</Text>
      {p.left !== undefined && (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
          <Text style={{ fontSize: 40, fontWeight: '800', color: t.fg, letterSpacing: -1.5 }}>{big}</Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: t.sub }}>{caption}</Text>
        </View>
      )}
      {progress !== null && (
        <>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(127,127,127,0.25)', overflow: 'hidden', marginTop: 6 }}>
            <View style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 4, backgroundColor: paper ? colors.ink : ACCENT[p.tone] }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: t.sub }}>{p.from}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: t.sub }}>{p.to}</Text>
          </View>
        </>
      )}
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
          SIRADAKİ DERS · {period.no}. ders · {duration(inMin)} sonra
        </Text>
        <Text style={{ fontSize: soon ? 17 : 15.5, fontWeight: '800', color: colors.ink }} numberOfLines={2}>
          {classLabel(lesson.className)} · {lesson.subject}
        </Text>
      </View>
    </Card>
  );
}
