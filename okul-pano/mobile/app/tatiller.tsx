import { View } from 'react-native';
import { useUpcomingHolidays, type HolidayList } from '../src/data.ts';
import { addDays, dateSpan, fullDate } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Badge, Card, Empty, ErrorNote, Loading, Screen, SectionTitle, T } from '../src/ui.tsx';

const SOURCE = {
  official: { label: 'Resmî tatil', tone: 'danger' },
  meb: { label: 'MEB takvimi', tone: 'success' },
  school: { label: 'Okulun tatili', tone: 'primary' },
} as const;

/** "Kurban Bayramı 2. Gün" → "Kurban Bayramı": aynı tatilin ardışık günleri tek satırda */
const groupName = (name: string) => name.replace(/ \d+\. Gün$/, '');

function group(list: HolidayList['holidays']) {
  const out: { name: string; start: string; end: string; source: keyof typeof SOURCE }[] = [];
  for (const h of list) {
    const last = out[out.length - 1];
    if (last && last.source === h.source && groupName(last.name) === groupName(h.name) && addDays(last.end, 1) === h.date) {
      last.end = h.date;
      last.name = groupName(h.name);
    } else out.push({ name: h.name, start: h.date, end: h.date, source: h.source });
  }
  return out;
}

/** Tatil takvimi: eğitim yılının sonuna kadar tatiller, arifeler (yarım gün) ve olası köprü günleri */
export default function Tatiller() {
  const q = useUpcomingHolidays();
  const holidays = group(q.data?.holidays ?? []);
  return (
    <Screen back title="Tatil takvimi" subtitle="MEB takvimi, bayramlar ve okulun tatilleri" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <ErrorNote error={q.error} />
      {q.isLoading ? (
        <Loading />
      ) : (
        <>
          <SectionTitle>Tatiller</SectionTitle>
          {holidays.length ? (
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {holidays.map((h, i) => {
                const days = Math.round((Date.parse(h.end) - Date.parse(h.start)) / 86400_000) + 1;
                return (
                  <View key={`${h.start}-${h.name}`} style={{ paddingVertical: 12, gap: 4, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <T weight="700" style={{ flex: 1 }}>
                        {h.name}
                      </T>
                      <Badge tone={SOURCE[h.source].tone}>{SOURCE[h.source].label}</Badge>
                    </View>
                    <T size={13} color={colors.muted}>
                      {dateSpan(h.start, h.end)}
                      {days > 1 ? ` · ${days} gün` : ''}
                    </T>
                  </View>
                );
              })}
            </Card>
          ) : (
            <Card>
              <Empty icon="sunny-outline" title="Yaklaşan tatil yok" />
            </Card>
          )}

          {(q.data?.halfDays.length ?? 0) > 0 && (
            <>
              <SectionTitle>Yarım günler (arife)</SectionTitle>
              <Card style={{ paddingVertical: 4, gap: 0 }}>
                {q.data!.halfDays.map((h, i) => (
                  <View key={h.date} style={{ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                    <T weight="700">{h.name}</T>
                    <T size={13} color={colors.muted}>
                      {fullDate(h.date)} · öğleden sonra tatil
                    </T>
                  </View>
                ))}
              </Card>
            </>
          )}

          {(q.data?.bridges.length ?? 0) > 0 && (
            <>
              <SectionTitle>Olası köprü günleri</SectionTitle>
              <Card style={{ paddingVertical: 4, gap: 0 }}>
                {q.data!.bridges.map((b, i) => (
                  <View key={b.date} style={{ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                    <T weight="700">{fullDate(b.date)}</T>
                    <T size={13} color={colors.muted}>
                      {b.near} ile tatil arasında kalıyor · idari izin ilan edilirse tatil olur
                    </T>
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
