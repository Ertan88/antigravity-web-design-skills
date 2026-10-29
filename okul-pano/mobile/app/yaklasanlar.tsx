import { View } from 'react-native';
import { useSchoolQuery } from '../src/data.ts';
import { clock, fullDate, localIso } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Card, Empty, ErrorNote, Loading, Screen, SectionTitle, T } from '../src/ui.tsx';

interface Exam {
  id: string;
  title: string;
  examAt: string;
  isActive: boolean;
}
interface SchoolEvent {
  id: string;
  title: string;
  organizer: string | null;
  date: string;
  time: string | null;
  place: string | null;
  isActive: boolean;
}

/** Sınavlar ve etkinlikler: panodaki sınav sayacı ve etkinlik takviminin yaklaşan kayıtları */
export default function Yaklasanlar() {
  const exams = useSchoolQuery<Exam[]>('exams');
  const events = useSchoolQuery<SchoolEvent[]>('events');
  const now = Date.now();
  const today = localIso();
  const upcomingExams = (exams.data ?? []).filter((e) => e.isActive && Date.parse(e.examAt) >= now).sort((a, b) => a.examAt.localeCompare(b.examAt));
  const upcomingEvents = (events.data ?? []).filter((e) => e.isActive && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const days = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 86400_000));

  return (
    <Screen
      back
      title="Sınavlar ve etkinlikler"
      refreshing={exams.isRefetching || events.isRefetching}
      onRefresh={() => void Promise.all([exams.refetch(), events.refetch()])}
    >
      <ErrorNote error={exams.error ?? events.error} />
      {exams.isLoading || events.isLoading ? (
        <Loading />
      ) : (
        <>
          <SectionTitle>Sınavlar</SectionTitle>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {upcomingExams.length ? (
              upcomingExams.map((e, i) => (
                <View
                  key={e.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: '#f1efea' }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T weight="700">{e.title}</T>
                    <T size={13} color={colors.muted}>
                      {fullDate(localIso(new Date(e.examAt)))} · {clock(e.examAt)}
                    </T>
                  </View>
                  <T size={13} weight="800" color={colors.primary}>
                    {days(e.examAt) ? `${days(e.examAt)} gün` : 'Bugün'}
                  </T>
                </View>
              ))
            ) : (
              <Empty icon="school-outline" title="Yaklaşan sınav yok" />
            )}
          </Card>

          <SectionTitle>Etkinlikler</SectionTitle>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {upcomingEvents.length ? (
              upcomingEvents.map((e, i) => (
                <View key={e.id} style={{ paddingVertical: 12, gap: 2, borderTopWidth: i ? 1 : 0, borderTopColor: '#f1efea' }}>
                  <T weight="700">{e.title}</T>
                  <T size={13} color={colors.muted}>
                    {[fullDate(e.date), e.time, e.place, e.organizer].filter(Boolean).join(' · ')}
                  </T>
                </View>
              ))
            ) : (
              <Empty icon="calendar-number-outline" title="Yaklaşan etkinlik yok" />
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
