import { periodLabel, sortPeriods } from '@okulpano/shared/bell';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../src/text.tsx';
import { useMeToday, useNow } from '../src/data.ts';
import { teacherDay, WEEKDAY_LONG, WEEKDAY_SHORT } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Card, Chip, Empty, ErrorNote, Loading, Screen, SectionTitle, T } from '../src/ui.tsx';

/** Ders programım ve zil saatleri: haftanın her günü için dersler; seçilen günün zil çizelgesi */
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

  // Seçilen günün zil çizelgesi: o günü kapsayan en dar çizelge (panoyla aynı seçim)
  const schedule = data.bellSchedules.filter((s) => s.weekdays.includes(day)).sort((a, b) => a.weekdays.length - b.weekdays.length)[0];
  const periods = schedule ? sortPeriods(schedule.periods) : [];
  const lessons = new Map(data.lessons.filter((l) => l.weekday === day).map((l) => [l.periodNo, l]));
  const weekly = data.lessons.length;
  const isToday = today?.now.weekday === day;

  return (
    <Screen
      back
      title="Ders programım"
      subtitle={weekly ? `Haftalık ${weekly} ders saati` : undefined}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
    >
      {!data.teacher && (
        <Card tone="warning">
          <T weight="700">Hesabınız bir öğretmen kaydına bağlı değil</T>
          <T size={13} color={colors.muted}>
            Yalnızca zil saatleri görünür. Okul yöneticiniz hesabınızı öğretmen kaydınızla eşleştirince dersleriniz de gelir.
          </T>
        </Card>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[1, 2, 3, 4, 5, 6, 7]
          .filter((d) => d <= 5 || data.bellSchedules.some((s) => s.weekdays.includes(d)))
          .map((d) => (
            <Chip key={d} label={WEEKDAY_SHORT[d]} selected={d === day} onPress={() => setWeekday(d)} />
          ))}
      </View>
      <SectionTitle>
        {WEEKDAY_LONG[day]}
        {isToday ? ' · bugün' : ''}
      </SectionTitle>
      {isToday && today?.holiday ? (
        <Card>
          <Empty icon="sunny-outline" title="Bugün tatil" text={today.holiday} />
        </Card>
      ) : !periods.length ? (
        <Card>
          <Empty icon="notifications-off-outline" title="Bu gün zil çalmıyor" />
        </Card>
      ) : (
        <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          {periods.map((p, i) => {
            const l = lessons.get(p.no);
            const state = isToday ? today?.lessons.find((x) => x.period.no === p.no)?.state : undefined;
            const cut = isToday && today?.endsAt && p.start >= today.endsAt;
            return (
              <View
                key={p.no}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 11,
                  paddingHorizontal: 14,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: colors.divider,
                  backgroundColor: state === 'now' ? colors.primarySoft : colors.card,
                  opacity: state === 'past' || cut ? 0.5 : 1,
                }}
              >
                <View style={{ width: 92 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>
                    {p.start} – {p.end}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>{periodLabel(p)}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: l ? '700' : '400', color: l ? colors.ink : colors.faint }}>
                  {cut ? 'Yarım gün · ders yok' : l ? `${l.className} · ${l.subject}` : 'Boş'}
                </Text>
                {state === 'now' && <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>ŞİMDİ</Text>}
                {state === 'next' && <Text style={{ fontSize: 11, fontWeight: '800', color: colors.muted }}>SIRADAKİ</Text>}
              </View>
            );
          })}
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
