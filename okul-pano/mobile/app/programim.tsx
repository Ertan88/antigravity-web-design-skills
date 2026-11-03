import type { Period, Shift } from '@okulpano/shared/bell';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../src/text.tsx';
import { useMeToday, useNow } from '../src/data.ts';
import { dayBellPeriods, teacherDay, WEEKDAY_LONG, WEEKDAY_SHORT } from '../src/day.ts';
import { colors, tiles, type TileTone } from '../src/theme.ts';
import { Card, Empty, ErrorNote, HolidayCard, Icon, Loading, Screen, T } from '../src/ui.tsx';

/*
 * Ders programım: üstte (bugün) şu anki ders büyük kartta, kalan süre ve ilerlemeyle; altında günün zaman çizelgesi.
 * Art arda aynı sınıfın aynı dersi tek blokta birleşir ("5–8. ders · 4 saat"), boş saatler ince bir aralık satırına
 * iner. Sınıflar renkle ayrılır; gün çiplerinde o günün ders sayısı yazar.
 */

type Lesson = { weekday: number; periodNo: number; className: string; subject: string; shift?: Shift | null };
interface Block {
  shift: Shift;
  className: string;
  subject: string;
  periods: Period[];
}
type Row = { kind: 'block'; block: Block } | { kind: 'gap'; periods: Period[] } | { kind: 'lunch'; from: string; to: string };

/** Sınıf renkleri (bento kutuları): hafta içindeki sınıflara sırayla verilir, aynı sınıf hep aynı renkte */
const TONES: TileTone[] = ['lilac', 'mint', 'sky', 'peach', 'rose', 'sun'];
const ACCENT: Record<TileTone, string> = { lilac: '#8b5cf6', mint: '#22c55e', sky: '#0ea5e9', peach: '#f97316', rose: '#f43f5e', sun: '#eab308', ink: '#57534e', paper: '#a8a29e' };

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} sa${min % 60 ? ` ${min % 60} dk` : ''}` : `${min} dk`);
const range = (ps: Period[]) => (ps.length === 1 ? `${ps[0]!.no}. ders` : `${ps[0]!.no}–${ps[ps.length - 1]!.no}. ders`);

/** Günün satırları: dersler blok, boş saatler aralık; teneffüsten uzun ara (öğle arası) ayrı satır */
function dayRows(periods: Period[], lessonAt: (no: number) => Lesson | undefined, shift: Shift): Row[] {
  const rows: Row[] = [];
  const lastLesson = Math.max(-1, ...periods.map((p, i) => (lessonAt(p.no) ? i : -1)));
  periods.slice(0, lastLesson + 1).forEach((p, i) => {
    const prev = periods[i - 1];
    if (prev && toMin(p.start) - toMin(prev.end) >= 25) rows.push({ kind: 'lunch', from: prev.end, to: p.start });
    const l = lessonAt(p.no);
    const last = rows[rows.length - 1];
    if (l) {
      if (last?.kind === 'block' && last.block.className === l.className && last.block.subject === l.subject) last.block.periods.push(p);
      else rows.push({ kind: 'block', block: { shift, className: l.className, subject: l.subject, periods: [p] } });
    } else if (last?.kind === 'gap') last.periods.push(p);
    else rows.push({ kind: 'gap', periods: [p] });
  });
  return rows;
}

export default function Programim() {
  const q = useMeToday();
  const now = useNow(30_000);
  const data = q.data;
  const today = data ? teacherDay(data, now) : null;
  const [weekday, setWeekday] = useState<number | null>(null);
  const day = weekday ?? (today && today.now.weekday <= 5 ? today.now.weekday : 1);

  if (!data) {
    return (
      <Screen back title="Ders programım">
        <ErrorNote error={q.error} />
        <Loading />
      </Screen>
    );
  }

  const lessons = data.lessons as Lesson[];
  const dual = Boolean(data.dualShift);
  const shiftOf = (l: Lesson): Shift => (dual && l.shift === 'afternoon' ? 'afternoon' : 'morning');
  const classes = [...new Set(lessons.map((l) => l.className))].sort((a, b) => a.localeCompare(b, 'tr'));
  const toneOf = (className: string): TileTone => TONES[classes.indexOf(className) % TONES.length]!;
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 5 || lessons.some((l) => l.weekday === d));
  const isToday = today?.now.weekday === day;
  const nowMin = today ? Math.floor(today.now.secondsOfDay / 60) : 0;

  // Seçilen günün satırları (ikili öğretimde vardiya vardiya); bugün arifeyse yarım gün saatinden sonrası düşer
  const dayLessons = lessons.filter((l) => l.weekday === day);
  const shifts: Shift[] = dual ? [...new Set(dayLessons.map(shiftOf))].sort() : ['morning'];
  const sections = shifts.map((shift) => {
    let periods = dayBellPeriods(data, day, shift);
    if (isToday && today?.endsAt) periods = periods.filter((p) => p.start < today.endsAt!);
    const at = (no: number) => dayLessons.find((l) => l.periodNo === no && shiftOf(l) === shift);
    return { shift, rows: dayRows(periods, at, shift) };
  });
  const blocks = sections.flatMap((s) => s.rows.flatMap((r) => (r.kind === 'block' ? [r.block] : [])));
  const first = blocks[0]?.periods[0];
  const lastBlock = blocks[blocks.length - 1];
  const last = lastBlock?.periods[lastBlock.periods.length - 1];

  // Bugün: şu anki ve sıradaki ders (blok içinde hangi saat)
  const live = isToday && !today?.holiday ? liveState(blocks, nowMin) : null;

  return (
    <Screen
      back
      title="Ders programım"
      subtitle={lessons.length ? `Haftalık ${lessons.length} ders saati` : undefined}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
    >
      {!data.teacher && (
        <Card tone="warning">
          <T weight="700">Hesabınız bir öğretmen kaydına bağlı değil</T>
          <T size={13} color={colors.muted}>
            Okul yöneticiniz hesabınızı öğretmen kaydınızla eşleştirince ders programınız burada görünür.
          </T>
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map((d) => {
          const on = d === day;
          const n = lessons.filter((l) => l.weekday === d).length;
          const todayChip = today?.now.weekday === d;
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${WEEKDAY_LONG[d]}, ${n} ders`}
              onPress={() => setWeekday(d)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 8,
                borderRadius: 16,
                borderWidth: on ? 0 : 1,
                borderColor: todayChip ? colors.brand : colors.border,
                backgroundColor: on ? colors.primary : colors.card,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: on ? colors.onPrimary : colors.ink }}>{WEEKDAY_SHORT[d]}</Text>
              <Text style={{ fontSize: 10.5, fontWeight: '600', color: on ? colors.onPrimary : colors.faint, opacity: on ? 0.7 : 1 }}>{n ? `${n} ders` : 'boş'}</Text>
            </Pressable>
          );
        })}
      </View>

      {live?.now && <NowCard block={live.now.block} period={live.now.period} nowMin={nowMin} tone={toneOf(live.now.block.className)} />}
      {live?.next && <NextCard block={live.next.block} period={live.next.period} nowMin={nowMin} soon={!live.now} tone={toneOf(live.next.block.className)} />}
      {isToday && live && !live.now && !live.next && blocks.length > 0 && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="checkmark-circle-outline" size={22} color={colors.success} />
          <T weight="700">Bugünkü dersleriniz bitti</T>
        </Card>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
          {WEEKDAY_LONG[day]}
          {isToday ? ' · bugün' : ''}
        </Text>
        {first && last && (
          <T size={12.5} color={colors.faint} weight="600">
            {first.start} – {last.end}
          </T>
        )}
      </View>

      {isToday && today?.holiday ? (
        <HolidayCard label="Bugün" name={today.holiday} />
      ) : !blocks.length ? (
        <Card>
          <Empty icon="cafe-outline" title="Bu gün dersiniz yok" />
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          {sections.map((s) => (
            <View key={s.shift} style={{ gap: 8 }}>
              {sections.length > 1 && (
                <T size={12.5} weight="800" color={colors.faint}>
                  {s.shift === 'morning' ? 'SABAHÇI' : 'ÖĞLENCİ'}
                </T>
              )}
              {s.rows.map((r, i) =>
                r.kind === 'block' ? (
                  <BlockRow key={i} block={r.block} tone={toneOf(r.block.className)} nowMin={isToday ? nowMin : null} />
                ) : r.kind === 'gap' ? (
                  <GapRow key={i} periods={r.periods} />
                ) : (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 46 }} />
                    <Icon name="restaurant-outline" size={14} color={colors.subtle} />
                    <T size={12.5} color={colors.subtle} weight="600">
                      Öğle arası {r.from} – {r.to}
                    </T>
                  </View>
                ),
              )}
            </View>
          ))}
          {last && (
            <T size={12.5} color={colors.subtle} weight="600" style={{ paddingLeft: 56 }}>
              Son ders {last.end}'de biter
            </T>
          )}
        </View>
      )}
      {isToday && today?.halfDay && (
        <T size={13} color={colors.warning} weight="600" style={{ textAlign: 'center' }}>
          {today.halfDay} · yarım gün, son zil {today.endsAt}
        </T>
      )}
    </Screen>
  );
}

/** Bugün: şu an derste mi, sıradaki ders hangisi */
function liveState(blocks: Block[], nowMin: number) {
  let now: { block: Block; period: Period } | null = null;
  let next: { block: Block; period: Period } | null = null;
  for (const block of blocks)
    for (const period of block.periods) {
      if (!now && toMin(period.start) <= nowMin && nowMin < toMin(period.end)) now = { block, period };
      else if (!next && toMin(period.start) > nowMin) next = { block, period };
    }
  return { now, next };
}

/** Şu anki ders: büyük kart, kalan süre ve ilerleme */
function NowCard({ block, period, nowMin, tone }: { block: Block; period: Period; nowMin: number; tone: TileTone }) {
  const t = tiles[tone];
  const start = toMin(period.start);
  const end = toMin(period.end);
  const left = Math.max(0, end - nowMin);
  const progress = Math.min(1, Math.max(0, (nowMin - start) / (end - start)));
  const index = block.periods.indexOf(period) + 1;
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 26, padding: 18, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12.5, fontWeight: '800', color: t.sub, letterSpacing: 0.4 }}>ŞU AN · {period.no}. DERS</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#fff' }}>derste</Text>
        </View>
      </View>
      <Text style={{ fontSize: 24, fontWeight: '800', color: t.fg, letterSpacing: -0.6, marginTop: 6 }}>{block.subject}</Text>
      <Text style={{ fontSize: 14.5, fontWeight: '700', color: t.sub }}>
        {block.className}
        {block.periods.length > 1 ? ` · ${block.periods.length} saatlik bloğun ${index}. saati` : ''}
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

/** Sıradaki ders: derste değilken büyük, derste iken küçük kart */
function NextCard({ block, period, nowMin, soon, tone }: { block: Block; period: Period; nowMin: number; soon: boolean; tone: TileTone }) {
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
          {block.className} · {block.subject}
        </Text>
      </View>
    </Card>
  );
}

/** Zaman çizelgesinde bir blok: art arda aynı ders; bugünse her saat çubukta işaretli */
function BlockRow({ block, tone, nowMin }: { block: Block; tone: TileTone; nowMin: number | null }) {
  const t = tiles[tone];
  const ps = block.periods;
  const start = ps[0]!;
  const end = ps[ps.length - 1]!;
  const past = nowMin !== null && toMin(end.end) <= nowMin;
  return (
    <View style={{ flexDirection: 'row', gap: 10, opacity: past ? 0.55 : 1 }}>
      <Text style={{ width: 46, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: colors.faint, paddingTop: 3, fontVariant: ['tabular-nums'] }}>{start.start}</Text>
      <View style={{ flex: 1, backgroundColor: t.bg, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, borderLeftWidth: 5, borderLeftColor: ACCENT[tone] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: t.sub, flex: 1 }}>
            {range(ps)} · {start.start}–{end.end}
          </Text>
          <View style={{ backgroundColor: t.chip, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: t.fg }}>{ps.length} saat</Text>
          </View>
        </View>
        <Text style={{ fontSize: 17, fontWeight: '800', color: t.fg, letterSpacing: -0.3, marginTop: 3 }}>{block.subject}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: t.sub, marginTop: 1 }}>{block.className}</Text>
        {ps.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 3, marginTop: 9 }}>
            {ps.map((p) => {
              const s = toMin(p.start);
              const e = toMin(p.end);
              const fill = nowMin === null ? 0 : nowMin >= e ? 1 : nowMin <= s ? 0 : (nowMin - s) / (e - s);
              return (
                <View key={p.no} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(127,127,127,0.25)', overflow: 'hidden' }}>
                  <View style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: ACCENT[tone] }} />
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

/** Boş saatler: tek ince satır */
function GapRow({ periods }: { periods: Period[] }) {
  const min = toMin(periods[periods.length - 1]!.end) - toMin(periods[0]!.start);
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Text style={{ width: 46, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: colors.subtle, fontVariant: ['tabular-nums'] }}>{periods[0]!.start}</Text>
      <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: colors.borderStrong, borderStyle: 'dashed', marginLeft: 6, paddingLeft: 12, paddingVertical: 4 }}>
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.subtle }}>
          {range(periods)} boş · {duration(min)}
        </Text>
      </View>
    </View>
  );
}
