import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useInternshipAccess, useSchoolQuery } from '../../src/data.ts';
import { FillSheet, fmtDays, letter, LegendBand, monthName, MONTH_NAMES, SendSheet, shiftMonth, TONE, useScopeView, type PendingMark, type SheetData, type SheetDay } from '../../src/intern.tsx';
import { Text } from '../../src/text.tsx';
import { colors, radius } from '../../src/theme.ts';
import { Button, Chip, Empty, ErrorNote, Icon, Loading, Screen, Segmented, T } from '../../src/ui.tsx';

/*
 * İşletmede devam · aylık çizelge (mobil, A1): ay hafta hafta bloklara bölünür, her blok öğrenci × beş gün; her gün
 * sabah ve öğleden sonra iki küçük hücre. Yalnızca gösterir: bir güne dokununca gün ekranı o günle açılır ve işaret
 * orada değiştirilir. Bu ayda bugünden önceki haftalar kapalı gelir (kısa özetle), dokununca açılır.
 */

const WD = ['', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu'];
const NAME_W = 92;

export default function AylikCizelge() {
  const p = useLocalSearchParams<{ ay?: string }>();
  const [month, setMonth] = useState(() => (p.ay && /^\d{4}-\d{2}$/.test(p.ay) ? p.ay : new Date().toISOString().slice(0, 7)));
  const sheet = useSchoolQuery<SheetData>(`internship/sheet?month=${month}`);
  const d = sheet.data?.month === month ? sheet.data : undefined;
  const pending = useSchoolQuery<PendingMark[]>('internship/pending');
  const access = useInternshipAccess();
  const scope = useScopeView(d, access.data);
  const [businessId, setBusinessId] = useState('');
  const [filling, setFilling] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const rows = useMemo(() => (d?.students ?? []).filter((s) => scope.visible(s) && (!businessId || s.businessId === businessId)), [d, scope, businessId]);

  // Hafta içi günler haftalara: her hafta pazartesiden cumaya (ay sınırında kısalır)
  const weeks = useMemo(() => {
    const out: { key: string; days: { day: SheetDay; i: number }[] }[] = [];
    d?.days.forEach((day, i) => {
      if (day.weekday >= 6) return;
      const last = out[out.length - 1];
      if (last && day.weekday > last.days[last.days.length - 1]!.day.weekday) last.days.push({ day, i });
      else out.push({ key: day.date, days: [{ day, i }] });
    });
    return out;
  }, [d]);

  const today = d?.today ?? '';
  const isOpen = (w: { key: string; days: { day: SheetDay }[] }) => {
    const past = w.days[w.days.length - 1]!.day.date < today && month === today.slice(0, 7);
    return open.has(w.key) ? past : !past;
  };
  const toggle = (key: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const pendingDays = (pending.data?.length ?? 0) / 2;
  const range = (w: { days: { day: SheetDay }[] }) => {
    const a = w.days[0]!.day.date;
    const b = w.days[w.days.length - 1]!.day.date;
    return `${a === b ? '' : `${Number(a.slice(8))}–`}${Number(b.slice(8))} ${MONTH_NAMES[Number(a.slice(5, 7)) - 1]}`;
  };

  const footer = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {rows.some((s) => s.editable) && (
        <Button variant="secondary" style={{ flex: 1 }} onPress={() => setFilling(true)}>
          Boş günlere X koy
        </Button>
      )}
      <Button style={{ flex: 1 }} disabled={!pendingDays} onPress={() => setSending(true)}>
        {pendingDays ? `Gönder · ${fmtDays(pendingDays)} gün` : 'Gönder'}
      </Button>
    </View>
  );

  return (
    <Screen title="Aylık çizelge" subtitle={monthName(month)} back refreshing={sheet.isRefetching} onRefresh={() => void sheet.refetch()} footer={footer}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" size="sm" icon="chevron-back" onPress={() => setMonth(shiftMonth(month, -1))}>
          {MONTH_NAMES[Number(shiftMonth(month, -1).slice(5, 7)) - 1]}
        </Button>
        <View style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onPress={() => setMonth(shiftMonth(month, 1))}>
          {`${MONTH_NAMES[Number(shiftMonth(month, 1).slice(5, 7)) - 1]} ›`}
        </Button>
      </View>
      {scope.options && <Segmented<'mine' | 'all'> value={scope.value} onChange={scope.setView} options={scope.options} />}
      {d && d.businesses.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          <Chip label="Bütün işletmeler" selected={!businessId} onPress={() => setBusinessId('')} />
          {d.businesses.map((b) => (
            <Chip key={b.id} label={b.name} selected={businessId === b.id} onPress={() => setBusinessId(b.id)} />
          ))}
        </ScrollView>
      )}
      <LegendBand />
      <ErrorNote error={sheet.error} />
      {notice && (
        <T size={13} color={colors.success} weight="700">
          {notice}
        </T>
      )}
      {!d ? (
        <Loading />
      ) : !rows.length ? (
        <Empty icon="business-outline" title="Öğrenci yok" text="Bu ayda gösterilecek öğrenci yok." />
      ) : (
        weeks.map((w) => {
          const shown = isOpen(w);
          const current = w.days.some((x) => x.day.date === today);
          // Kapalı haftanın özeti: devamsızlık ve kontrol edilmemiş gün sayısı
          let absent = 0;
          let unchecked = 0;
          let work = 0;
          for (const s of rows)
            for (const { i } of w.days)
              for (const c of s.cells[i]!) {
                if (c === 'D' || c === 'İ' || c === 'R' || c === 'H') absent += 0.5;
                if (c === '?') unchecked += 0.5;
                if (c !== 'TA' && c !== 'O' && c !== 'W') work += 1;
              }
          return (
            <View key={w.key} style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: current ? colors.info : colors.border, padding: 10, gap: 6 }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: shown }} onPress={() => toggle(w.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '800', color: colors.ink }}>
                  {range(w)}
                  {current ? <Text style={{ color: colors.info }}> · bu hafta</Text> : null}
                </Text>
                {!shown && (
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: unchecked ? colors.warning : colors.muted }}>
                    {[absent ? `${fmtDays(absent)} gün devamsızlık` : null, unchecked ? `${fmtDays(unchecked)} gün kontrol edilmedi` : null].filter(Boolean).join(' · ') || (work ? 'Tamam' : 'Tatil ya da okulda')}
                  </Text>
                )}
                <Icon name={shown ? 'chevron-up' : 'chevron-down'} size={16} color={colors.faint} />
              </Pressable>
              {shown && (
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row' }}>
                    <View style={{ width: NAME_W }} />
                    {[1, 2, 3, 4, 5].map((wd) => {
                      const x = w.days.find((y) => y.day.weekday === wd);
                      return (
                        <Text key={wd} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: x?.day.date === today ? colors.info : colors.faint }}>
                          {x ? `${WD[wd]} ${Number(x.day.date.slice(8))}` : ''}
                        </Text>
                      );
                    })}
                  </View>
                  {rows.map((s) => (
                    <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ width: NAME_W, fontSize: 11.5, fontWeight: '700', color: colors.ink, paddingRight: 4 }} numberOfLines={1}>
                        {s.fullName}
                      </Text>
                      {[1, 2, 3, 4, 5].map((wd) => {
                        const x = w.days.find((y) => y.day.weekday === wd);
                        if (!x) return <View key={wd} style={{ flex: 1 }} />;
                        const date = x.day.date;
                        return (
                          <Pressable
                            key={wd}
                            accessibilityRole="button"
                            accessibilityLabel={`${s.fullName} ${Number(date.slice(8))} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]}: sabah ${letter(s.cells[x.i]![0]!) || 'boş'}, öğleden sonra ${letter(s.cells[x.i]![1]!) || 'boş'}. Gün ekranında aç`}
                            onPress={() => router.dismissTo({ pathname: '/isletme-devam', params: { tarih: date } })}
                            style={{ flex: 1, flexDirection: 'row', gap: 2, paddingHorizontal: 1.5, borderRadius: 7, borderWidth: date === today ? 1.5 : 0, borderColor: colors.info }}
                          >
                            {s.cells[x.i]!.map((c, h) => {
                              const t = TONE[c] ?? TONE['']!;
                              return (
                                <View key={h} style={{ flex: 1, height: 22, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, borderWidth: t.border ? 1 : 0, borderColor: t.border, borderStyle: t.dashed ? 'dashed' : 'solid' }}>
                                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: t.fg }}>{letter(c)}</Text>
                                </View>
                              );
                            })}
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })
      )}
      {d && rows.length > 0 && (
        <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 4 }}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '800', color: colors.ink }}>Ay toplamı</Text>
            <Text style={{ width: 64, textAlign: 'center', fontSize: 10, fontWeight: '800', color: colors.faint }}>ÖZÜRLÜ</Text>
            <Text style={{ width: 64, textAlign: 'center', fontSize: 10, fontWeight: '800', color: colors.faint }}>ÖZÜRSÜZ</Text>
          </View>
          {rows.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, borderTopWidth: 1, borderTopColor: colors.divider }}>
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
                {s.fullName}
              </Text>
              <Text style={{ width: 64, textAlign: 'center', fontSize: 13, fontWeight: '800', color: colors.muted }}>{s.totals.excused ? fmtDays(s.totals.excused) : '–'}</Text>
              <Text style={{ width: 64, textAlign: 'center', fontSize: 13, fontWeight: '800', color: s.totals.unexcused ? colors.danger : colors.muted }}>{s.totals.unexcused ? fmtDays(s.totals.unexcused) : '–'}</Text>
            </View>
          ))}
        </View>
      )}
      {d && (
        <T size={12} color={colors.faint}>
          Çizelge yalnızca gösterir. İşaretlemek için güne dokunun; gün ekranı o günle açılır.
        </T>
      )}
      {filling && d && (
        <FillSheet
          month={d.month}
          today={d.today}
          businesses={d.businesses}
          businessId={businessId}
          onClose={() => setFilling(false)}
          onDone={(msg) => {
            setFilling(false);
            setNotice(msg);
            void sheet.refetch();
          }}
        />
      )}
      {sending && pending.data && (
        <SendSheet
          rows={pending.data}
          onClose={() => setSending(false)}
          onSent={(msg) => {
            setSending(false);
            setNotice(msg);
            void sheet.refetch();
            void pending.refetch();
          }}
        />
      )}
    </Screen>
  );
}
