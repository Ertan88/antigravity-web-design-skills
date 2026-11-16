import { academicYearLabel, academicYearOf, semesterBreak, summerBreak, type AcademicCalendarData } from '@okulpano/shared/academicCalendar';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../src/text.tsx';
import { api } from '../../src/api.ts';
import { useAcademicCalendars, type CalendarRow } from '../../src/data.ts';
import { dateSpan, fullDate, timeAgo } from '../../src/day.ts';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, Empty, ErrorNote, Loading, Screen, SectionTitle, T } from '../../src/ui.tsx';

const SOURCE = { meb: 'MEB duyurusundan', manual: 'Elle girildi', builtin: 'Kurulum verisi' } as const;

type Row = { key: string; label: string; value: string };

/** Takvimin satır satır özeti: tarihler kısaltmasız, yıl ve gün adıyla */
function rowsOf(data: AcademicCalendarData, startYear: number): Row[] {
  const sem = semesterBreak(data);
  const summer = summerBreak(data, startYear);
  const brk = (b: AcademicCalendarData['breaks'][number]): Row => ({ key: `b-${b.name}`, label: b.name, value: dateSpan(b.start, b.end) });
  return [
    { key: 'start', label: 'Dersler başlar', value: fullDate(data.lessonsStart) },
    ...data.breaks.filter((b) => b.start < data.term1End).map(brk),
    { key: 't1', label: 'Birinci dönem biter', value: fullDate(data.term1End) },
    { key: 'sem', label: 'Yarıyıl tatili', value: dateSpan(sem.start, sem.end) },
    { key: 't2', label: 'İkinci dönem başlar', value: fullDate(data.term2Start) },
    ...data.breaks.filter((b) => b.start > data.term1End).map(brk),
    { key: 'end', label: 'Ders yılı biter', value: fullDate(data.lessonsEnd) },
    { key: 'summer', label: 'Yaz tatili', value: dateSpan(summer.start, summer.end) },
  ];
}

const days = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400_000) + 1);

/** Yılın renkli şeridi: birinci dönem, ara tatiller, yarıyıl, ikinci dönem (genişlik gün sayısıyla orantılı) */
function YearStrip({ data, height = 30, labels = true }: { data: AcademicCalendarData; height?: number; labels?: boolean }) {
  const sem = semesterBreak(data);
  const segs: { kind: 'l1' | 'l2' | 'b'; n: number; label?: string }[] = [];
  const term = (from: string, to: string, kind: 'l1' | 'l2', label: string) => {
    let cur = from;
    let first = true;
    for (const b of data.breaks.filter((x) => x.start > from && x.start < to).sort((x, y) => x.start.localeCompare(y.start))) {
      segs.push({ kind, n: days(cur, b.start) - 1, label: first ? label : undefined });
      segs.push({ kind: 'b', n: days(b.start, b.end) });
      cur = b.end;
      first = false;
    }
    segs.push({ kind, n: days(cur, to), label: first ? label : undefined });
  };
  term(data.lessonsStart, data.term1End, 'l1', '1. dönem');
  segs.push({ kind: 'b', n: days(sem.start, sem.end), label: 'Yarıyıl' });
  term(data.term2Start, data.lessonsEnd, 'l2', '2. dönem');
  const bg = { l1: '#6366f1', l2: '#818cf8', b: '#16a34a' } as const;
  return (
    <View style={{ flexDirection: 'row', height, borderRadius: 10, overflow: 'hidden' }} accessibilityLabel="Eğitim yılı şeridi: dönemler ve tatiller">
      {segs
        .filter((x) => x.n > 0)
        .map((x, i) => (
          <View key={i} style={{ flex: x.n, backgroundColor: bg[x.kind], alignItems: 'center', justifyContent: 'center' }}>
            {labels && x.label && x.n > 14 ? (
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#fff' }} numberOfLines={1}>
                {x.label}
              </Text>
            ) : null}
          </View>
        ))}
    </View>
  );
}

function Legend() {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {(
        [
          ['Ders', '#6366f1'],
          ['Tatil', '#16a34a'],
        ] as const
      ).map(([t, c]) => (
        <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c }} />
          <T size={11.5} weight="700" color={colors.muted}>
            {t}
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
  const rows = (calendars.data ?? []).filter((c) => c.startYear >= current).sort((a, b) => Number(Boolean(b.pending) || b.status === 'review') - Number(Boolean(a.pending) || a.status === 'review') || b.startYear - a.startYear);
  const missingNext = !rows.some((r) => r.startYear === current + 1);

  return (
    <Screen title="MEB takvimi" subtitle="Bütün okullar için ortak" refreshing={calendars.isRefetching} onRefresh={() => void calendars.refetch()}>
      <ErrorNote error={calendars.error ?? scan.error ?? decide.error} />
      {note && (
        <Card tone="primary">
          <T color={colors.onPrimary} weight="600">
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
  const waiting = Boolean(c.pending) || c.status === 'review';
  const [open, setOpen] = useState(waiting);
  const shown = c.pending?.data ?? c.data;
  const before = c.pending ? new Map(rowsOf(c.data, c.startYear).map((r) => [r.key, r.value])) : null;
  const rows = rowsOf(shown, c.startYear);
  const changed = before ? rows.filter((r) => before.get(r.key) !== r.value).length : 0;
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle right={<Badge tone={waiting ? 'warning' : 'success'}>{waiting ? 'Onay bekliyor' : 'Onaylandı'}</Badge>}>{c.label.replace('-', '–')}</SectionTitle>
      <Card style={{ gap: 10 }}>
        <T size={12} color={colors.muted}>
          {c.pending ? `MEB duyurusundan · ${timeAgo(c.pending.foundAt)} bulundu${changed ? ` · ${changed} tarih farklı` : ''}` : `${SOURCE[c.source]}${c.checkedAt ? ` · son tarama ${timeAgo(c.checkedAt)}` : ''}`}
        </T>
        <YearStrip data={shown} height={open ? 30 : 20} labels={open} />
        {open && <Legend />}
        {open ? (
          <View>
            {rows.map((r, i) => {
              const old = before?.get(r.key);
              const diff = before && old !== r.value;
              return (
                <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T size={12} color={colors.muted}>
                      {r.label}
                    </T>
                    {diff && old ? (
                      <T size={12.5} color={colors.subtle} style={{ textDecorationLine: 'line-through' }}>
                        {old}
                      </T>
                    ) : null}
                    <T size={14} weight={diff ? '800' : '600'} color={diff ? colors.warning : colors.ink}>
                      {r.value}
                    </T>
                  </View>
                  {diff ? <Badge tone="warning">{old ? 'Değişti' : 'Yeni'}</Badge> : null}
                </View>
              );
            })}
          </View>
        ) : (
          <Button size="sm" variant="ghost" icon="chevron-down" onPress={() => setOpen(true)}>
            Tarihleri göster
          </Button>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {waiting && (
            <Button icon="checkmark" loading={deciding} onPress={() => onDecide('accept')} style={{ flex: 1 }}>
              Onayla
            </Button>
          )}
          {c.pending && (
            <Button variant="secondary" disabled={deciding} onPress={() => onDecide('reject')} style={{ flex: 1 }}>
              Mevcut kalsın
            </Button>
          )}
          <Button size="sm" variant="secondary" icon="refresh" loading={scanning} onPress={onScan} style={waiting ? { flexBasis: '100%' } : { flex: 1 }}>
            Şimdi tara
          </Button>
        </View>
      </Card>
    </View>
  );
}
