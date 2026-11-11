import { lunchBeforeNo, type Period } from '@okulpano/shared/bell';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../src/text.tsx';
import { useMeToday, useNow } from '../src/data.ts';
import { classLabel, dateOfWeekday, lessonsOn, teacherDay, WEEKDAY_LONG, WEEKDAY_SHORT } from '../src/day.ts';
import { ACCENT, classTones, CoverTag, daySlots, LiveLesson, toMin, type Lesson } from '../src/lesson.tsx';
import { colors } from '../src/theme.ts';
import { Card, Empty, ErrorNote, HolidayCard, Icon, Loading, Screen, T } from '../src/ui.tsx';

/*
 * Ders programım: bugün üstte şu anki ders büyük kartta (kalan süre, ilerleme) ve sıradaki ders; altında günün
 * kalanı kısa liste, geçmiş saatler katlanır. Başka bir gün seçilince o günün bütün saatleri listelenir.
 * Her ders saati ayrı satırdır; sınıflar renkli noktayla ayrılır, gün çiplerinde ders sayısı yazar.
 */

type Item = { kind: 'slot'; period: Period; lesson?: Lesson } | { kind: 'lunch'; from: string; to: string } | { kind: 'shift'; label: string };

export default function Programim() {
  return <ProgramimScreen back />;
}

/** Ders programım: Menü'den geri düğmeli, öğretmenin alt menüsünde (Program sekmesi) geri düğmesiz */
export function ProgramimScreen({ back }: { back?: boolean }) {
  const q = useMeToday();
  const now = useNow(30_000);
  const data = q.data;
  const today = data ? teacherDay(data, now) : null;
  const [weekday, setWeekday] = useState<number | null>(null);
  const [showPast, setShowPast] = useState(false);
  const day = weekday ?? (today && today.now.weekday <= 5 ? today.now.weekday : 1);

  if (!data) {
    return (
      <Screen back={back} title="Ders programım">
        <ErrorNote error={q.error} />
        <Loading />
      </Screen>
    );
  }

  const lessons = data.lessons;
  const toneOf = classTones(lessons);
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 5 || lessons.some((l) => l.weekday === d));
  const isToday = today?.now.weekday === day;
  const nowMin = today ? Math.floor(today.now.secondsOfDay / 60) : 0;

  // Günün satırları: son dersten sonraki boş saatler yazılmaz; teneffüsten uzun ara (öğle arası) ayrı satır
  // Seçili günün bu haftaki tarihi (telefonun bugününe göre): o güne elle müdahale ve sınıfa özel zil ona göre
  const sections = daySlots(data, day, isToday ? today?.endsAt : null, today ? dateOfWeekday(today.now.isoDate, day) : undefined);
  const items: Item[] = [];
  for (const s of sections) {
    const last = s.slots.reduce((m, x, i) => (x.lesson ? i : m), -1);
    if (last < 0) continue;
    if (sections.length > 1) items.push({ kind: 'shift', label: s.shift === 'morning' ? 'Sabahçı' : 'Öğlenci' });
    // Öğle arası: günün en uzun arası (panodaki hesapla aynı); öteki aralar teneffüs, satır olarak yazılmaz
    const lunchNo = lunchBeforeNo(s.slots.map((x) => x.period), data.lunchThresholdMin);
    s.slots.slice(0, last + 1).forEach((x, i, arr) => {
      const prev = arr[i - 1];
      if (prev && x.period.no === lunchNo) items.push({ kind: 'lunch', from: prev.period.end, to: x.period.start });
      items.push({ kind: 'slot', period: x.period, lesson: x.lesson });
    });
  }
  const slots = items.filter((i): i is Extract<Item, { kind: 'slot' }> => i.kind === 'slot');
  const count = slots.filter((s) => s.lesson).length;
  const first = slots.find((s) => s.lesson)?.period;
  const lastSlot = slots[slots.length - 1]?.period;

  // Bugün: biten ve süren saatler katlanır (şu anki ders üstteki kartta)
  const done = (it: Item) => isToday && it.kind === 'slot' && toMin(it.period.start) <= nowMin;
  const pastItems = isToday ? items.filter((it, i) => done(it) || (it.kind !== 'slot' && items.slice(i + 1).some(done))) : [];
  const restItems = isToday ? items.filter((it) => !pastItems.includes(it)) : items;
  const pastLessons = pastItems.filter((it) => it.kind === 'slot' && it.lesson).length;
  const pastSlots = pastItems.filter((it) => it.kind === 'slot') as Extract<Item, { kind: 'slot' }>[];

  return (
    <Screen
      back={back}
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
          // Haftalık dersler ve bu haftaki o güne verilen görev dersleri
          const n = today ? lessonsOn(data, dateOfWeekday(today.now.isoDate, d), d).length : lessons.filter((l) => l.weekday === d).length;
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
                borderColor: today?.now.weekday === d ? colors.brand : colors.border,
                backgroundColor: on ? colors.primary : colors.card,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: on ? colors.onPrimary : colors.ink }}>{WEEKDAY_SHORT[d]}</Text>
              <Text style={{ fontSize: 10.5, fontWeight: '600', color: on ? colors.onPrimary : colors.faint, opacity: on ? 0.7 : 1 }}>{n ? `${n} ders` : 'boş'}</Text>
            </Pressable>
          );
        })}
      </View>

      {isToday && <LiveLesson data={data} />}

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
          {isToday ? 'Bugün' : WEEKDAY_LONG[day]}
        </Text>
        {first && lastSlot && (
          <T size={12.5} color={colors.faint} weight="600">
            {isToday && pastItems.length ? `${lastSlot.end}'de biter` : `${count} ders · ${first.start} – ${lastSlot.end}`}
          </T>
        )}
      </View>

      {isToday && today?.holiday ? (
        <HolidayCard label="Bugün" name={today.holiday} />
      ) : !count ? (
        <Card>
          <Empty icon="cafe-outline" title="Bu gün dersiniz yok" />
        </Card>
      ) : (
        <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          {restItems.length === 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 }}>
              <Icon name="checkmark-circle-outline" size={20} color={colors.success} />
              <T weight="700">Bugünkü dersleriniz bitti</T>
            </View>
          )}
          {restItems.map((it, i) => (
            <ItemRow key={i} it={it} first={i === 0} tone={it.kind === 'slot' && it.lesson ? ACCENT[toneOf(it.lesson.className)] : null} />
          ))}
          {pastItems.length > 0 && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showPast }}
                onPress={() => setShowPast((x) => !x)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16, borderTopWidth: restItems.length ? 1 : 0, borderTopColor: colors.divider }}
              >
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.faint }}>
                  Geçmiş: {pastSlots.length === 1 ? `${pastSlots[0]!.period.no}. ders` : `${pastSlots[0]!.period.no}–${pastSlots[pastSlots.length - 1]!.period.no}. ders`} ({pastLessons} ders
                  {pastSlots.length - pastLessons ? `, ${pastSlots.length - pastLessons} boş` : ''})
                </Text>
                <Icon name={showPast ? 'chevron-up' : 'chevron-down'} size={18} color={colors.faint} />
              </Pressable>
              {showPast && pastItems.map((it, i) => <ItemRow key={`p${i}`} it={it} first={false} past tone={it.kind === 'slot' && it.lesson ? ACCENT[toneOf(it.lesson.className)] : null} />)}
            </>
          )}
        </Card>
      )}
      {isToday && today?.halfDay && (
        <T size={13} color={colors.warning} weight="600" style={{ textAlign: 'center' }}>
          {today.halfDay} · yarım gün, son zil {today.endsAt}
        </T>
      )}
    </Screen>
  );
}

/** Kısa liste satırı: "1. Ders" ve altında başlangıç – bitiş saati, sınıf · ders (renkli nokta); boş saat soluk; öğle arası ince satır */
function ItemRow({ it, first, past, tone }: { it: Item; first: boolean; past?: boolean; tone: string | null }) {
  const border = { borderTopWidth: first ? 0 : 1, borderTopColor: colors.divider };
  if (it.kind === 'shift')
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, ...border }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.faint, letterSpacing: 0.4 }}>{it.label.toLocaleUpperCase('tr-TR')}</Text>
      </View>
    );
  if (it.kind === 'lunch')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.bg, opacity: past ? 0.55 : 1, ...border }}>
        <Icon name="restaurant-outline" size={14} color={colors.subtle} />
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.subtle }}>
          Öğle arası {it.from} – {it.to}
        </Text>
      </View>
    );
  const { period, lesson } = it;
  // İzinli öğretmen yerine girilen ders: turuncu zemin, "GÖREV" etiketi ve kimin yerine
  const cover = lesson?.coverFor;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: lesson ? 12 : 9,
        paddingHorizontal: 16,
        opacity: past ? 0.55 : 1,
        backgroundColor: cover ? colors.warningSoft : undefined,
        ...border,
      }}
    >
      <View style={{ width: 96 }}>
        <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.muted }}>{period.no}. Ders</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.faint, fontVariant: ['tabular-nums'] }}>
          {period.start} – {period.end}
        </Text>
      </View>
      {lesson && cover ? (
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, lineHeight: 20 }}>
              {classLabel(lesson.className)} · {lesson.subject}
            </Text>
            <CoverTag />
          </View>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.muted }}>{cover} yerine</Text>
        </View>
      ) : lesson ? (
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink, lineHeight: 20 }}>
          {classLabel(lesson.className)} · {lesson.subject}
        </Text>
      ) : (
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.subtle }}>Boş</Text>
      )}
      {tone && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tone }} />}
    </View>
  );
}
