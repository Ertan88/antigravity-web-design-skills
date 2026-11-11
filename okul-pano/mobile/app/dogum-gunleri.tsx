import { View } from 'react-native';
import { useSchoolQuery } from '../src/data.ts';
import { addDays, fullDate, localIso } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Card, Empty, ErrorNote, ListRow, Loading, Screen, SectionTitle, T } from '../src/ui.tsx';

interface Student {
  id: string;
  fullName: string;
  birthDate: string;
  classGroupId: string | null;
}

/** Doğum günleri: bugün ve önümüzdeki 7 gün (panodaki kutlama kartıyla aynı liste; doğum yılı gösterilmez) */
export default function DogumGunleri() {
  const students = useSchoolQuery<Student[]>('students');
  const classes = useSchoolQuery<{ id: string; name: string }[]>('classes');
  const className = new Map((classes.data ?? []).map((c) => [c.id, c.name]));
  const today = localIso();
  const week = Array.from({ length: 8 }, (_, i) => addDays(today, i));
  const byDay = week.map((d) => ({ date: d, list: (students.data ?? []).filter((s) => s.birthDate.slice(5, 10) === d.slice(5)) }));
  const total = byDay.reduce((n, d) => n + d.list.length, 0);

  return (
    <Screen back title="Doğum günleri" refreshing={students.isRefetching} onRefresh={() => void students.refetch()}>
      <ErrorNote error={students.error} />
      {students.isLoading ? (
        <Loading />
      ) : !total ? (
        <Card>
          <Empty icon="gift-outline" title="Bu hafta doğum günü yok" text="Öğrenci listesi yönetim panelinden Excel ile yüklenir." />
        </Card>
      ) : (
        byDay
          .filter((d) => d.list.length)
          .map((d) => (
            <View key={d.date} style={{ gap: 6 }}>
              <SectionTitle>{d.date === today ? `Bugün · ${fullDate(d.date)}` : fullDate(d.date)}</SectionTitle>
              <Card style={{ paddingVertical: 4, gap: 0 }}>
                {d.list.map((s, i) => (
                  <ListRow
                    key={s.id}
                    icon="gift-outline"
                    iconTone={d.date === today ? 'gold' : 'muted'}
                    title={s.fullName}
                    subtitle={s.classGroupId ? className.get(s.classGroupId) : null}
                    last={i === d.list.length - 1}
                  />
                ))}
              </Card>
            </View>
          ))
      )}
      <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
        Öğrencilerin doğum tarihi ve yaşı gösterilmez.
      </T>
    </Screen>
  );
}
