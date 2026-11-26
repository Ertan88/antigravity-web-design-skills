import { isLessonFree, SUMMER_BREAK } from '@okulpano/shared/academicCalendar';
import { View } from 'react-native';
import { useUpcomingHolidays, type HolidayList } from '../src/data.ts';
import { addDays, dateSpan, dayTitle, fullDate, localIso } from '../src/day.ts';
import { Text } from '../src/text.tsx';
import { colors, radius, tiles } from '../src/theme.ts';
import { Badge, Card, Empty, ErrorNote, Loading, Screen, SectionTitle, T } from '../src/ui.tsx';

const SOURCE = {
  official: { label: 'Resmî', tone: 'danger' },
  meb: { label: 'MEB', tone: 'success' },
  school: { label: 'Okul', tone: 'primary' },
} as const;

type Entry =
  | { kind: 'holiday'; name: string; start: string; end: string; source: keyof typeof SOURCE }
  | { kind: 'half'; name: string; start: string }
  | { kind: 'bridge'; near: string; start: string };

/** "Kurban Bayramı 2. Gün" → "Kurban Bayramı": aynı tatilin ardışık günleri tek satırda */
const groupName = (name: string) => name.replace(/ \d+\. Gün$/, '');

function group(list: HolidayList['holidays']) {
  const out: Extract<Entry, { kind: 'holiday' }>[] = [];
  for (const h of list) {
    // Yaz tatili listede gösterilmez (ders yılı bitince bütün yaz tatildir; günler hesapta tatil sayılmaya devam eder)
    if (h.name === SUMMER_BREAK || isLessonFree(h.name)) continue;
    const last = out[out.length - 1];
    if (last && last.source === h.source && groupName(last.name) === groupName(h.name) && addDays(last.end, 1) === h.date) {
      last.end = h.date;
      last.name = groupName(h.name);
    } else out.push({ kind: 'holiday', name: h.name, start: h.date, end: h.date, source: h.source });
  }
  return out;
}

const dayCount = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000) + 1;
/** Aralıktaki iş günleri (Pazartesi–Cuma) */
const workDays = (a: string, b: string) => {
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) {
    const w = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
};
const lengthText = (a: string, b: string) => {
  const all = dayCount(a, b);
  if (all === 1) return '1 gün';
  const work = workDays(a, b);
  return work && work !== all ? `${all} gün · ${work} iş günü` : `${all} gün`;
};
const monthKey = (iso: string) => iso.slice(0, 7);
const monthTitle = (iso: string) => dayTitle(`${iso.slice(0, 7)}-01`, { month: 'long', year: 'numeric' }).toLocaleUpperCase('tr-TR');
const weekdayShort = (iso: string) => dayTitle(iso, { weekday: 'short' }).toLocaleUpperCase('tr-TR');

/** Çalışma takvimi (A): sıradaki tatile geri sayım; altında aylara ayrılmış tatiller, arifeler ve olası köprü günleri */
export default function Tatiller() {
  const q = useUpcomingHolidays();
  const today = localIso();
  const holidays = group(q.data?.holidays ?? []);
  const entries: Entry[] = [
    ...holidays,
    ...(q.data?.halfDays ?? []).map((h): Entry => ({ kind: 'half', name: h.name, start: h.date })),
    ...(q.data?.bridges ?? []).map((b): Entry => ({ kind: 'bridge', near: b.near, start: b.date })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  // Sıradaki tatil: devam eden ya da ilk gelecek tatil (arife ve köprü sayılmaz)
  const next = holidays.find((h) => h.end >= today);
  const months: { key: string; items: Entry[] }[] = [];
  for (const e of entries) {
    const k = monthKey(e.start);
    if (months[months.length - 1]?.key !== k) months.push({ key: k, items: [] });
    months[months.length - 1]!.items.push(e);
  }

  return (
    <Screen back title="Çalışma takvimi" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <ErrorNote error={q.error} />
      {q.isLoading ? (
        <Loading />
      ) : !entries.length ? (
        <Card>
          <Empty icon="sunny-outline" title="Yaklaşan tatil yok" />
        </Card>
      ) : (
        <>
          {next && <NextHoliday name={next.name} start={next.start} end={next.end} today={today} />}
          {months.map((m) => (
            <View key={m.key} style={{ gap: 6 }}>
              <SectionTitle>{monthTitle(m.key)}</SectionTitle>
              <Card style={{ paddingVertical: 4, paddingHorizontal: 10, gap: 0 }}>
                {m.items.map((e, i) => (
                  <Row key={`${e.kind}-${e.start}`} entry={e} first={i === 0} />
                ))}
              </Card>
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

function NextHoliday({ name, start, end, today }: { name: string; start: string; end: string; today: string }) {
  const t = tiles.ink;
  const ongoing = start <= today;
  const left = dayCount(today, start) - 1;
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: radius.xl, padding: 18, gap: 4 }} accessible accessibilityLabel={`Sıradaki tatil ${name}, ${ongoing ? 'şu an tatildesiniz' : `${left} gün kaldı`}`}>
      <Text style={{ fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, color: t.sub }}>{ongoing ? 'ŞU AN TATİL' : 'SIRADAKİ TATİL'}</Text>
      <Text style={{ fontSize: 21, fontWeight: '800', color: t.fg }} numberOfLines={2}>
        {name}
      </Text>
      {ongoing ? (
        <Text style={{ fontSize: 17, fontWeight: '800', color: t.fg, marginTop: 6 }}>
          {end === today ? 'Bugün son gün' : `${dayCount(today, end) - 1} gün daha sürüyor`}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <Text style={{ fontSize: 52, lineHeight: 58, fontWeight: '800', letterSpacing: -2, color: t.fg }}>{left === 0 ? 'Yarın' : String(left)}</Text>
          {left > 0 && <Text style={{ fontSize: 17, fontWeight: '800', color: t.fg }}>gün kaldı</Text>}
        </View>
      )}
      <Text style={{ fontSize: 13, color: t.sub }}>
        {dateSpan(start, end)} · {lengthText(start, end)}
      </Text>
    </View>
  );
}

function Row({ entry: e, first }: { entry: Entry; first: boolean }) {
  const bar = e.kind === 'holiday' ? (e.source === 'official' ? colors.danger : e.source === 'meb' ? colors.success : colors.info) : e.kind === 'half' ? colors.gold : colors.warningBorder;
  const title = e.kind === 'holiday' ? e.name : e.kind === 'half' ? e.name : 'Olası köprü günü';
  const sub =
    e.kind === 'holiday'
      ? e.start === e.end
        ? fullDate(e.start)
        : `${dateSpan(e.start, e.end)} · ${lengthText(e.start, e.end)}`
      : e.kind === 'half'
        ? `${fullDate(e.start)} · öğleden sonra tatil`
        : `${e.near} ile tatil arasında kalıyor. İdari izin ilan edilirse tatil olur.`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: colors.divider }}>
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: bar }} />
      <View style={{ width: 50, alignItems: 'center', paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.bg }}>
        <Text style={{ fontSize: 19, lineHeight: 22, fontWeight: '800', color: colors.ink }}>{Number(e.start.slice(8, 10))}</Text>
        <Text style={{ fontSize: 10.5, fontWeight: '800', color: colors.faint }}>{weekdayShort(e.start)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T weight="800" color={e.kind === 'bridge' ? colors.warning : colors.ink}>
          {title}
        </T>
        <T size={12.5} color={colors.muted}>
          {sub}
        </T>
      </View>
      {e.kind === 'holiday' ? <Badge tone={SOURCE[e.source].tone}>{SOURCE[e.source].label}</Badge> : e.kind === 'half' ? <Badge tone="warning">Yarım gün</Badge> : null}
    </View>
  );
}
