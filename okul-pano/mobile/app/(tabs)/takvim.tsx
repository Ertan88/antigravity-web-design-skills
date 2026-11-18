import { academicYearLabel, academicYearOf, semesterBreak, summerBreak, type AcademicCalendarData } from '@okulpano/shared/academicCalendar';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../src/text.tsx';
import { api } from '../../src/api.ts';
import { useAcademicCalendars, type CalendarRow } from '../../src/data.ts';
import { dateSpan, fullDate, timeAgo } from '../../src/day.ts';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, Empty, ErrorNote, Loading, Screen, T } from '../../src/ui.tsx';

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

const DAY = 86400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const today = () => new Date().toISOString().slice(0, 10);

type Now = { title: string; until: string | null; next: { name: string; inDays: number } | null; progress: number };

/** Bugün eğitim yılının neresinde: dönem ya da tatil, bitişi, sonraki tatil ve geçen süre */
function nowOf(data: AcademicCalendarData, startYear: number, t: string): Now {
  const sem = semesterBreak(data);
  const summer = summerBreak(data, startYear);
  const holidays = [...data.breaks.map((b) => ({ name: b.name, start: b.start, end: b.end })), { name: 'Yarıyıl tatili', ...sem }, { name: 'Yaz tatili', ...summer }].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const inHoliday = holidays.find((h) => h.start <= t && t <= h.end);
  const nextH = holidays.find((h) => h.start > t);
  const next = nextH ? { name: nextH.name, inDays: days(t, nextH.start) } : null;
  const total = days(data.lessonsStart, data.lessonsEnd) || 1;
  const progress = Math.min(1, Math.max(0, days(data.lessonsStart, t) / total));
  if (t < data.lessonsStart) return { title: 'Ders yılı başlamadı', until: data.lessonsStart, next, progress: 0 };
  if (inHoliday) return { title: inHoliday.name, until: inHoliday.end, next, progress };
  if (t <= data.term1End) return { title: '1. dönem', until: data.term1End, next, progress };
  if (t >= data.term2Start && t <= data.lessonsEnd) return { title: '2. dönem', until: data.lessonsEnd, next, progress };
  return { title: 'Ders yılı bitti', until: null, next, progress: 1 };
}

/**
 * MEB çalışma takvimi (platform yöneticisi, C): üstte bugünün durumu; MEB'den yeni takvim bulunduysa yalnızca değişen
 * tarihler eski ve yeni yan yana, onay tek dokunuşla; altta yılların kısa tarih listesi. Her yıl haziran ortasından
 * itibaren MEB'in sitesi taranır; onaylanan takvim bütün okulların tatil takvimine işlenir.
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
    mutationFn: ({ year, action }: { year: number; action: 'accept' | 'reject' }) => api(`/api/platform/academic-calendars/${year}/${action}`, { method: 'POST' }),
    onSuccess: refresh,
  });

  const t = today();
  const current = academicYearOf(t);
  const all = (calendars.data ?? []).filter((c) => c.startYear >= current).sort((a, b) => a.startYear - b.startYear);
  const waiting = all.filter((c) => Boolean(c.pending) || c.status === 'review');
  const settled = all.filter((c) => !c.pending && c.status !== 'review');
  const now = all.find((c) => c.startYear === current && c.status !== 'review');
  const missingNext = !all.some((r) => r.startYear === current + 1);

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
      {calendars.isLoading ? (
        <Loading />
      ) : (
        <>
          {now && <NowCard data={now.data} startYear={now.startYear} t={t} />}
          {waiting.map((c) => (
            <ReviewCard
              key={c.startYear}
              c={c}
              deciding={decide.isPending && decide.variables?.year === c.startYear}
              onDecide={(action) => decide.mutate({ year: c.startYear, action })}
            />
          ))}
          {missingNext && (
            <Card style={{ gap: 8 }}>
              <T weight="800">{academicYearLabel(current + 1).replace('-', '–')} takvimi henüz yok</T>
              <T size={13} color={colors.muted}>
                MEB takvimi genellikle haziran ortasından itibaren duyurur; sistem her gün kendiliğinden tarar.
              </T>
              <Button size="sm" variant="secondary" icon="refresh" loading={scan.isPending && scan.variables === current + 1} onPress={() => scan.mutate(current + 1)}>
                Şimdi tara
              </Button>
            </Card>
          )}
          {settled.map((c) => (
            <DatesCard key={c.startYear} c={c} scanning={scan.isPending && scan.variables === c.startYear} onScan={() => scan.mutate(c.startYear)} />
          ))}
          {!all.length && !missingNext && (
            <Card>
              <Empty icon="calendar-outline" title="Takvim yok" />
            </Card>
          )}
        </>
      )}
      <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
        Takvimi elle düzeltmek için yönetim panelinde MEB Çalışma Takvimi sayfasını kullanın.
      </T>
    </Screen>
  );
}

/** Şu an: dönem ya da tatil, bitişi, sonraki tatile kalan gün, ders yılının geçen kısmı (marka renginde, iki temada aynı) */
function NowCard({ data, startYear, t }: { data: AcademicCalendarData; startYear: number; t: string }) {
  const n = nowOf(data, startYear, t);
  const pct = Math.round(n.progress * 100);
  return (
    <View style={{ backgroundColor: '#115e66', borderRadius: 22, padding: 16, gap: 4 }}>
      <Text style={{ fontSize: 11.5, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.4 }}>
        {`ŞU AN · ${academicYearLabel(startYear).replace('-', '–')}`}
      </Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff' }}>{n.title}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>
        {[n.until ? `Bitiş: ${fullDate(n.until)}` : null, n.next ? `Sonraki tatil: ${n.next.name}, ${n.next.inDays} gün sonra` : null].filter(Boolean).join(' · ')}
      </Text>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden', marginTop: 10 }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: '#fde68a' }} />
      </View>
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: 'rgba(255,255,255,0.8)' }}>{`Ders yılının %${pct}'i geçti`}</Text>
    </View>
  );
}

/** Onay bekleyen takvim: yalnızca değişen tarihler eski / yeni; "Tümünü gör" ile bütün tarihler */
function ReviewCard({ c, deciding, onDecide }: { c: CalendarRow; deciding: boolean; onDecide: (a: 'accept' | 'reject') => void }) {
  const [all, setAll] = useState(false);
  const shown = c.pending?.data ?? c.data;
  const before = c.pending ? new Map(rowsOf(c.data, c.startYear).map((r) => [r.key, r.value])) : null;
  const rows = rowsOf(shown, c.startYear);
  const changed = before ? rows.filter((r) => before.get(r.key) !== r.value) : rows;
  const list = all || !before ? rows : changed;
  return (
    <Card style={{ gap: 8, borderWidth: 1.5, borderColor: colors.warning }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T weight="800" style={{ flex: 1 }}>
          {`${c.label.replace('-', '–')} onay bekliyor`}
        </T>
        <Badge tone="warning">{before ? `${changed.length} fark` : 'Yeni'}</Badge>
      </View>
      <T size={12} color={colors.muted}>
        {c.pending ? `MEB duyurusundan · ${timeAgo(c.pending.foundAt)} bulundu` : SOURCE[c.source]}
      </T>
      <View>
        {list.map((r, i) => {
          const old = before?.get(r.key);
          const diff = before && old !== r.value;
          return (
            <View key={r.key} style={{ paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider, gap: 1 }}>
              <T size={12} color={colors.muted}>
                {r.label}
              </T>
              {diff && old ? (
                <T size={12.5} color={colors.subtle} style={{ textDecorationLine: 'line-through' }}>
                  {old}
                </T>
              ) : null}
              <T size={13.5} weight={diff ? '800' : '600'} color={diff ? colors.warning : colors.ink}>
                {r.value}
              </T>
            </View>
          );
        })}
      </View>
      {before && rows.length > changed.length && (
        <Button size="sm" variant="ghost" icon={all ? 'chevron-up' : 'chevron-down'} onPress={() => setAll((x) => !x)}>
          {all ? 'Yalnızca farkları göster' : `Diğer ${rows.length - changed.length} tarih aynı · Tümünü gör`}
        </Button>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {c.pending && (
          <Button variant="secondary" disabled={deciding} onPress={() => onDecide('reject')} style={{ flex: 1 }}>
            Mevcut kalsın
          </Button>
        )}
        <Button icon="checkmark" loading={deciding} onPress={() => onDecide('accept')} style={{ flex: 1 }}>
          Onayla
        </Button>
      </View>
    </Card>
  );
}

/** Onaylı yılın kısa tarih listesi: başlangıç, yarıyıl, bitiş; ara tatiller "Tümü" ile */
function DatesCard({ c, scanning, onScan }: { c: CalendarRow; scanning: boolean; onScan: () => void }) {
  const [all, setAll] = useState(false);
  const rows = rowsOf(c.data, c.startYear);
  const main = new Set(['start', 'sem', 'end']);
  const list = all ? rows : rows.filter((r) => main.has(r.key));
  const hidden = rows.length - list.length;
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T weight="800" style={{ flex: 1 }}>
          {`${c.label.replace('-', '–')} tarihleri`}
        </T>
        <Badge tone="success">Onaylandı</Badge>
      </View>
      {list.map((r) => (
        <View key={r.key} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.divider }}>
          <T size={13} color={colors.muted} style={{ flex: 1 }}>
            {r.label}
          </T>
          <T size={13} weight="700" style={{ flex: 1.4, textAlign: 'right' }}>
            {r.value}
          </T>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {(hidden > 0 || all) && (
          <Button size="sm" variant="ghost" icon={all ? 'chevron-up' : 'chevron-down'} onPress={() => setAll((x) => !x)} style={{ flex: 1 }}>
            {all ? 'Kısa göster' : 'Bütün tarihler'}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon="refresh" loading={scanning} onPress={onScan} style={{ flex: 1 }}>
          Şimdi tara
        </Button>
      </View>
      <T size={11.5} color={colors.faint}>
        {`${SOURCE[c.source]}${c.checkedAt ? ` · son tarama ${timeAgo(c.checkedAt)}` : ''}`}
      </T>
    </Card>
  );
}
