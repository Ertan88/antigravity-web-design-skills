import { academicYearLabel, academicYearOf, semesterBreak, summerBreak, type AcademicCalendarData } from '@okulpano/shared/academicCalendar';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../src/api.ts';
import { useAcademicCalendars, type CalendarRow } from '../../src/data.ts';
import { dateSpan, fullDate, timeAgo } from '../../src/day.ts';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, Empty, ErrorNote, Loading, Screen, SectionTitle, T } from '../../src/ui.tsx';

const SOURCE = { meb: 'MEB duyurusundan', manual: 'Elle girildi', builtin: 'Kurulum verisi' } as const;

/** Takvimin satır satır özeti: tarihler kısaltmasız, yıl ve gün adıyla */
function Summary({ data, startYear }: { data: AcademicCalendarData; startYear: number }) {
  const sem = semesterBreak(data);
  const summer = summerBreak(data, startYear);
  const rows: [string, string][] = [
    ['Dersler başlar', fullDate(data.lessonsStart)],
    ...data.breaks.filter((b) => b.start < data.term1End).map((b): [string, string] => [b.name, dateSpan(b.start, b.end)]),
    ['Birinci dönem biter', fullDate(data.term1End)],
    ['Yarıyıl tatili', dateSpan(sem.start, sem.end)],
    ['İkinci dönem başlar', fullDate(data.term2Start)],
    ...data.breaks.filter((b) => b.start > data.term1End).map((b): [string, string] => [b.name, dateSpan(b.start, b.end)]),
    ['Ders yılı biter', fullDate(data.lessonsEnd)],
    ['Yaz tatili', dateSpan(summer.start, summer.end)],
  ];
  return (
    <View style={{ gap: 8 }}>
      {rows.map(([k, v]) => (
        <View key={k}>
          <T size={12} color={colors.muted}>
            {k}
          </T>
          <T size={14} weight="600">
            {v}
          </T>
        </View>
      ))}
    </View>
  );
}

/**
 * MEB çalışma takvimi (platform yöneticisi): her yıl haziran ortasından itibaren MEB'in sitesi taranır, bulunan
 * takvim onaya düşer. Onaylanınca bütün okulların tatil takvimine işlenir.
 */
export default function Takvim() {
  const calendars = useAcademicCalendars();
  const qc = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['platform', 'academic-calendars'] });
  const scan = useMutation({
    mutationFn: (year: number) => api<{ message: string }>(`/api/platform/academic-calendars/${year}/scan`, { method: 'POST', body: {} }),
    onSuccess: (r) => {
      setNote(r.message);
      void refresh();
    },
  });
  const decide = useMutation({
    mutationFn: ({ year, action }: { year: number; action: 'accept' | 'reject' }) =>
      api(`/api/platform/academic-calendars/${year}/${action}`, { method: 'POST' }),
    onSuccess: refresh,
  });

  const current = academicYearOf(new Date().toISOString().slice(0, 10));
  const rows = (calendars.data ?? []).filter((c) => c.startYear >= current).sort((a, b) => a.startYear - b.startYear);
  const missingNext = !rows.some((r) => r.startYear === current + 1);

  return (
    <Screen title="MEB takvimi" subtitle="Bütün okullar için ortak" refreshing={calendars.isRefetching} onRefresh={() => void calendars.refetch()}>
      <ErrorNote error={calendars.error ?? scan.error ?? decide.error} />
      {note && (
        <Card tone="primary">
          <T color="#fff" weight="600">
            {note}
          </T>
        </Card>
      )}
      {missingNext && (
        <Card style={{ gap: 8 }}>
          <T weight="700">{academicYearLabel(current + 1)} takvimi henüz yok</T>
          <T size={13} color={colors.muted}>
            MEB takvimi genellikle haziran ortasından itibaren duyurur; sistem her gün kendiliğinden tarar. İsterseniz şimdi tarayın.
          </T>
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            loading={scan.isPending && scan.variables === current + 1}
            onPress={() => scan.mutate(current + 1)}
          >
            Şimdi tara
          </Button>
        </Card>
      )}
      {calendars.isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <Card>
          <Empty icon="calendar-outline" title="Takvim yok" />
        </Card>
      ) : (
        rows.map((c) => (
          <CalendarCard
            key={c.startYear}
            c={c}
            scanning={scan.isPending && scan.variables === c.startYear}
            onScan={() => scan.mutate(c.startYear)}
            onDecide={(action) => decide.mutate({ year: c.startYear, action })}
            deciding={decide.isPending && decide.variables?.year === c.startYear}
          />
        ))
      )}
      <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
        Takvimi elle düzeltmek için yönetim panelinde Tatil Takvimi sayfasını kullanın.
      </T>
    </Screen>
  );
}

function CalendarCard({
  c,
  scanning,
  onScan,
  onDecide,
  deciding,
}: {
  c: CalendarRow;
  scanning: boolean;
  onScan: () => void;
  onDecide: (a: 'accept' | 'reject') => void;
  deciding: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle
        right={
          <Badge tone={c.pending || c.status === 'review' ? 'warning' : 'success'}>{c.pending || c.status === 'review' ? 'Onay bekliyor' : 'Onaylandı'}</Badge>
        }
      >
        {`${c.label} eğitim yılı`}
      </SectionTitle>
      <Card style={{ gap: 12 }}>
        <T size={12} color={colors.muted}>
          {SOURCE[c.source]}
          {c.checkedAt ? ` · son tarama ${timeAgo(c.checkedAt)}` : ''}
        </T>
        <Summary data={c.data} startYear={c.startYear} />
        {c.pending && (
          <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
            <T weight="700" color={colors.warning}>
              MEB duyurusunda farklı tarihler bulundu
            </T>
            <Summary data={c.pending.data} startYear={c.startYear} />
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(c.pending || c.status === 'review') && (
            <Button size="sm" icon="checkmark" loading={deciding} onPress={() => onDecide('accept')}>
              {c.pending ? 'Yeni tarihleri uygula' : 'Onayla'}
            </Button>
          )}
          {c.pending && (
            <Button size="sm" variant="secondary" disabled={deciding} onPress={() => onDecide('reject')}>
              Mevcut kalsın
            </Button>
          )}
          <Button size="sm" variant="ghost" icon="refresh" loading={scanning} onPress={onScan}>
            Şimdi tara
          </Button>
        </View>
      </Card>
    </View>
  );
}
