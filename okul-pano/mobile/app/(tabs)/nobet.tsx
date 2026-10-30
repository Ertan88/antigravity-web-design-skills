import { normalizeName } from '@okulpano/shared/teachers';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../src/text.tsx';
import { api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useDutyWeek, useMeToday, useMyDuties, type DutyDay, type MyDuties, type ScheduleStatus } from '../../src/data.ts';
import { addDays, dayTitle } from '../../src/day.ts';
import { colors, tiles } from '../../src/theme.ts';
import { Badge, Banner, Button, Card, Empty, ErrorNote, HolidayCard, Icon, Label, Loading, Screen, Segmented, T } from '../../src/ui.tsx';

/** Nöbet (tasarım 2 ve 10): kendi nöbetlerim ve bugün kim nerede; yetkisi olan boş yere görevlendirir */
export default function Nobet() {
  const { isTeacher } = useAuth();
  const [tab, setTab] = useState<'mine' | 'all'>(isTeacher ? 'mine' : 'all');
  return (
    <Screen title={isTeacher ? 'Nöbetlerim' : 'Nöbetler'}>
      {isTeacher && (
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'mine', label: 'Benim Nöbetlerim' },
            { value: 'all', label: 'Kim Nerede' },
          ]}
        />
      )}
      {tab === 'mine' && isTeacher ? <MyDuties /> : <AllDuties />}
    </Screen>
  );
}

const monthName = (m: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
const WEEKDAY_LONG_TR = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const WEEKDAY_SHORT_TR = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/** Ayın çizelgesi girilmemişse son girilen ayınki gösterilir: kullanıcı bilsin */
function ScheduleNote({ schedule }: { schedule?: ScheduleStatus }) {
  if (!schedule || schedule.entered) return null;
  return (
    <Banner
      icon="alert-circle-outline"
      tone="warning"
      title={`${monthName(schedule.month)} nöbet çizelgesi henüz girilmedi`}
      text={schedule.usedMonth ? `${monthName(schedule.usedMonth)} çizelgesine göre gösteriliyor; değişebilir.` : 'Nöbetler okul yönetimi çizelgeyi girince görünür.'}
    />
  );
}

/**
 * Benim nöbetlerim: bu ayın bugünden sonraki nöbet günleri (okul içi nöbet yeri, taşımalı öğrenci görevi), birlikte
 * nöbetçi olanlar ve o günün nöbetçi müdür yardımcısı. Bilgiler sistemdeki çizelgeden (Excel ya da elle) gelir.
 */
function MyDuties() {
  const q = useMyDuties();
  const d = q.data;
  if (!d) return q.error ? <ErrorNote error={q.error} /> : <Loading />;
  const showingNext = d.showing !== d.month;
  return (
    <>
      {showingNext ? (
        <Banner icon="calendar-outline" tone="primary" title={`${monthName(d.month)} ayında kalan nöbetiniz yok`} text={`${monthName(d.showing)} nöbetleriniz aşağıda.`} />
      ) : (
        <ScheduleNote schedule={d.schedule} />
      )}
      {!showingNext && d.nextMonth.soon && !d.nextMonth.entered && (
        <Banner icon="calendar-outline" tone="primary" title={`${monthName(d.nextMonth.month)} nöbet çizelgesi henüz girilmedi`} text="Girildiğinde nöbetleriniz burada görünür." />
      )}
      <MonthStrip data={d} />
      {!d.teacher ? (
        <Card>
          <Empty icon="person-outline" title="Öğretmen kaydı bağlı değil" text="Okul yönetimi hesabınızı öğretmen kaydınızla eşleştirince nöbetleriniz görünür." />
        </Card>
      ) : !d.days.length ? (
        <Card>
          <Empty icon="checkmark-circle-outline" title={showingNext ? `${monthName(d.showing)} ayında da nöbetiniz yok` : 'Bu ay kalan nöbetiniz yok'} />
        </Card>
      ) : (
        d.days.map((day) => <MyDutyCard key={day.date} day={day} today={d.today} teacherName={d.teacherName} />)
      )}

      <Button icon="calendar-outline" variant="secondary" onPress={() => router.push('/izin')}>
        İzin bildir
      </Button>
      <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
        Nöbet günlerinizde ilk dersten 15 dakika önce telefonunuza hatırlatma gelir.
      </T>
    </>
  );
}

/**
 * Ay şeridi: ayın iş günleri Pazartesi'den Cuma'ya; okul içi nöbet sarı, taşımalı ve öğle yemeği nöbeti yeşil
 * (ikisi aynı günse yarı yarıya), tatil lila, geçmiş günler soluk. Liste günlerin ayrıntısını verir; şerit ayın
 * tamamını (tutulan nöbetler dahil) tek bakışta gösterir.
 */
function MonthStrip({ data }: { data: MyDuties }) {
  const month = data.showing;
  const marks = new Map(data.calendar.marks.map((m) => [m.date, m]));
  const holidays = new Map(data.calendar.holidays.map((h) => [h.date, h.name]));
  const last = Number(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate());
  const days = Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).filter((iso) => {
    const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
    return wd >= 1 && wd <= 5;
  });
  const lead = (new Date(`${days[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
  // Haftalara bölünür: ilk haftanın başı ve son haftanın sonu boş kutularla doldurulur
  const slots: (string | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (slots.length % 5) slots.push(null);
  const weeks = Array.from({ length: slots.length / 5 }, (_, i) => slots.slice(i * 5, i * 5 + 5));
  const upcoming = data.calendar.marks.filter((m) => m.date >= data.today);
  const next = upcoming[0]?.date;
  const dutyLeft = upcoming.filter((m) => m.duty).length;
  const transportLeft = upcoming.filter((m) => m.transport).length;
  const ink = tiles.ink;
  const cell = (iso: string) => {
    const m = marks.get(iso);
    const past = iso < data.today;
    const holiday = holidays.has(iso);
    const isNext = iso === next;
    const bg = holiday ? tiles.lilac.bg : m?.duty && !m.transport ? '#fde68a' : m?.transport && !m.duty ? '#bbf7d0' : 'rgba(255,255,255,0.08)';
    const fg = holiday ? tiles.lilac.fg : m?.duty ? '#713f12' : m?.transport ? '#14532d' : 'rgba(255,255,255,0.8)';
    return (
      <View
        key={iso}
        accessibilityLabel={`${dayTitle(iso)}${holiday ? `, tatil: ${holidays.get(iso)}` : ''}${m?.duty ? ', nöbet' : ''}${m?.transport ? ', taşımalı ve öğle yemeği nöbeti' : ''}`}
        style={{ flex: 1, height: 32, borderRadius: 9, overflow: 'hidden', backgroundColor: bg, opacity: past ? 0.45 : 1, borderWidth: isNext ? 2 : 0, borderColor: '#fff', flexDirection: 'row' }}
      >
        {m?.duty && m.transport && !holiday && (
          <>
            <View style={{ flex: 1, backgroundColor: '#fde68a' }} />
            <View style={{ flex: 1, backgroundColor: '#bbf7d0' }} />
          </>
        )}
        <Text style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, textAlign: 'center', textAlignVertical: 'center', lineHeight: 30, fontSize: 12.5, fontWeight: '800', color: fg }}>
          {Number(iso.slice(8))}
        </Text>
      </View>
    );
  };
  const legend: [string, string][] = [
    ['#fde68a', 'nöbet'],
    ...(data.hasTransport ? ([['#bbf7d0', 'taşımalı ve öğle']] as [string, string][]) : []),
    [tiles.lilac.bg, 'tatil'],
  ];
  return (
    <View style={{ backgroundColor: ink.bg, borderRadius: 26, padding: 16, gap: 12 }}>
      <View>
        <Text style={{ fontSize: 13, fontWeight: '700', color: ink.sub }}>{monthName(month)}{month === data.month ? ' · kalan' : ''}</Text>
        <Text style={{ fontSize: 38, lineHeight: 44, fontWeight: '800', letterSpacing: -1.5, color: ink.fg }}>{data.hasTransport ? upcoming.length : dutyLeft}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: ink.fg }}>
          {data.hasTransport ? `gün · ${dutyLeft} nöbet, ${transportLeft} taşımalı ve öğle` : `nöbet günü · ayda toplam ${data.calendar.marks.filter((m) => m.duty).length}`}
        </Text>
      </View>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {['Pzt', 'Sal', 'Çar', 'Per', 'Cum'].map((w) => (
            <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: ink.sub }}>
              {w}
            </Text>
          ))}
        </View>
        {weeks.map((week, w) => (
          <View key={w} style={{ flexDirection: 'row', gap: 6 }}>
            {week.map((iso, i) => (iso ? cell(iso) : <View key={`b${w}${i}`} style={{ flex: 1, height: 32 }} />))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        {legend.map(([c, label]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c }} />
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: ink.sub }}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MyDutyCard({ day, today, teacherName }: { day: MyDuties['days'][number]; today: string; teacherName: string | null }) {
  const isToday = day.date === today;
  const label = isToday ? `Bugün · ${WEEKDAY_LONG_TR[day.weekday]}` : dayTitle(day.date);
  if (day.holiday) return <HolidayCard label={label} name={day.holiday} />;
  return (
    <Card style={{ gap: 10 }}>
      <Label color={isToday ? colors.primary : colors.muted}>{label}</Label>
      {day.duties.map((x) => (
        <View key={x.dutyId} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="location-outline" size={18} color={colors.primary} />
            <T size={18} weight="800" style={{ flex: 1 }}>
              {x.area}
            </T>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {x.partners.length > 0 && <Pill>Birlikte: {x.partners.join(', ')}</Pill>}
            {x.substituteFor && <Pill tone="warning">{x.substituteFor} yerine</Pill>}
          </View>
          {x.coveredBy && (
            <T size={13} color={colors.warning} weight="600">
              İzniniz nedeniyle bu nöbeti {x.coveredBy} tutuyor.
            </T>
          )}
        </View>
      ))}
      {day.transport && (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: tiles.mint.bg, borderRadius: 14, padding: 12 }}>
          <Icon name="bus-outline" size={18} color={tiles.mint.fg} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: tiles.mint.fg, marginBottom: 2 }}>Taşımalı ve öğle yemeği nöbeti</Text>
            {[teacherName ?? 'Siz', ...day.transport.partners].map((name, i) => (
              <Text key={`${i}${name}`} style={{ fontSize: 13, fontWeight: i === 0 ? '700' : '600', color: i === 0 ? tiles.mint.fg : tiles.mint.sub }}>
                {i + 1}. Nöbetçi: {name}
              </Text>
            ))}
          </View>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.divider }}>
        <Icon name="person-circle-outline" size={16} color={colors.muted} />
        <T size={13} color={colors.muted}>
          Nöbetçi müdür yardımcısı: <Text style={{ fontWeight: '700', color: day.supervisor ? colors.ink : colors.faint }}>{day.supervisor ?? 'girilmemiş'}</Text>
        </T>
      </View>
    </Card>
  );
}

function Pill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warning' }) {
  return (
    <View style={{ backgroundColor: tone === 'warning' ? colors.warningSoft : colors.primarySoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ fontSize: 12, color: tone === 'warning' ? colors.warning : colors.ink }}>{children}</Text>
    </View>
  );
}

const shortMonth = (iso: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
/** Hafta sonuysa gelecek haftanın Pazartesi'si (gün şeridi iş günlerini gösterir) */
const workdayOf = (iso: string) => {
  const wd = ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return wd >= 6 ? addDays(iso, 8 - wd) : iso;
};

/**
 * Kim nerede: haftanın iş günleri üstte (Pazartesi–Cuma), seçilen günün nöbetçileri altta; oklarla haftalar
 * arasında geçilir. Tatil günleri lila; kullanıcının kendi satırı vurgulu.
 */
function AllDuties() {
  const { can, school } = useAuth();
  const today = useMeToday();
  const start = today.data ? workdayOf(today.data.today) : undefined;
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const anchor = start ? addDays(start, weekOffset * 7) : undefined;
  const q = useDutyWeek(anchor);
  const week = q.data;
  const day = week?.days.find((d) => d.date === (selected ?? anchor)) ?? week?.days[0];
  const canAssign = can('duties.manage');
  const todayIso = today.data?.today;
  const thisWeek = Boolean(week && todayIso && week.days.some((d) => d.date === todayIso));

  const areas = useMemo(() => {
    const map = new Map<string, DutyDay['entries']>();
    for (const e of day?.entries ?? []) {
      const k = normalizeName(e.area);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.values()];
  }, [day]);

  const goWeek = (by: number) => {
    setWeekOffset((w) => w + by);
    setSelected(null);
  };
  const first = week?.days[0]?.date;
  const last = week?.days[4]?.date;
  const label =
    first && last
      ? `${Number(first.slice(8))}${first.slice(5, 7) === last.slice(5, 7) ? '' : ` ${shortMonth(first)}`} – ${Number(last.slice(8))} ${shortMonth(last)}${thisWeek ? ' · bu hafta' : ''}`
      : '';

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Önceki hafta" hitSlop={8} onPress={() => goWeek(-1)} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Icon name="chevron-back" size={18} />
        </Pressable>
        <Text style={{ fontSize: 14.5, fontWeight: '800', color: colors.ink }}>{label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Sonraki hafta" hitSlop={8} onPress={() => goWeek(1)} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Icon name="chevron-forward" size={18} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(week?.days ?? []).map((d) => {
          const on = d.date === day?.date;
          const hol = Boolean(d.holiday);
          const isToday = d.date === todayIso;
          return (
            <Pressable
              key={d.date}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${dayTitle(d.date)}${hol ? `, tatil: ${d.holiday}` : ''}${isToday ? ', bugün' : ''}`}
              onPress={() => setSelected(d.date)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 14,
                alignItems: 'center',
                backgroundColor: on ? colors.primary : hol ? tiles.lilac.bg : colors.card,
                borderWidth: 1,
                borderColor: on ? colors.primary : hol ? tiles.lilac.bg : isToday ? colors.borderStrong : colors.border,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: on ? colors.onPrimary : hol ? tiles.lilac.fg : colors.muted }}>{WEEKDAY_SHORT_TR[d.weekday]}</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: on ? colors.onPrimary : hol ? tiles.lilac.fg : colors.ink }}>{Number(d.date.slice(8))}</Text>
              <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: isToday ? (on ? colors.onPrimary : colors.primary) : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>
      <ErrorNote error={q.error} />
      {!day ? (
        <Loading />
      ) : (
        <>
          {day.supervisor && (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="person-circle-outline" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <T size={12.5} color={colors.muted} weight="600">
                  Nöbetçi müdür yardımcısı
                </T>
                <T size={15.5} weight="800">
                  {day.supervisor}
                </T>
              </View>
            </Card>
          )}
          {day.holiday ? (
            <HolidayCard label={`${WEEKDAY_LONG_TR[day.weekday]} · tatil`} name={day.holiday} />
          ) : !day.entries.length ? (
            <Card>
              <Empty icon="shield-outline" title="Bu gün için nöbet girilmemiş" text="Nöbet çizelgesi panelden Excel ile ya da elle girilebilir." />
            </Card>
          ) : (
            <>
              <ScheduleNote schedule={day.schedule} />
              {day.gaps.length > 0 &&
                day.entries
                  .filter((e) => day.gaps.includes(e.dutyId))
                  .map((gap) => <GapCard key={gap.dutyId} day={day} gap={gap} canAssign={canAssign} />)}
              <Card style={{ paddingVertical: 4, gap: 0, overflow: 'hidden' }}>
                {areas.map((list, i) => {
                  const mine = list.some((e) => (e.substitute?.teacherId ?? e.teacherId) === school?.teacherId);
                  return (
                    <View
                      key={list[0]!.dutyId}
                      style={{ paddingVertical: 12, paddingHorizontal: 16, marginHorizontal: -16, gap: 3, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider, backgroundColor: mine ? tiles.sun.bg : 'transparent' }}
                    >
                      <T size={15.5} weight="800" color={mine ? tiles.sun.fg : colors.ink}>
                        {list.map((e) => (e.substitute ? `${e.substitute.teacherName} (yerine)` : e.onLeave ? `${e.teacherName} (izinli)` : e.teacherName)).join(', ')}
                        {mine ? ' · siz' : ''}
                      </T>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Icon name="location-outline" size={14} color={mine ? tiles.sun.fg : colors.muted} />
                        <T size={13} weight="600" color={mine ? tiles.sun.sub : colors.muted}>
                          {list[0]!.area}
                        </T>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}

/** Boş nöbet yeri ve öneriler (tasarım 10): "Ata" ile öğretmene bildirim gider, pano hemen güncellenir */
function GapCard({ day, gap, canAssign }: { day: DutyDay; gap: DutyDay['entries'][number]; canAssign: boolean }) {
  const { school } = useAuth();
  const path = useSchoolPath('duty-substitutions');
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assign = async (teacherId: string) => {
    setBusy(teacherId);
    setError(null);
    try {
      await api(path, { method: 'POST', body: { date: day.date, dutyId: gap.dutyId, teacherId } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: [school?.id, 'duty-day'] }),
        qc.invalidateQueries({ queryKey: [school?.id, 'duty-week'] }),
        qc.invalidateQueries({ queryKey: [school?.id, 'control-center'] }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Atanamadı');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card tone="warning" style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T size={16} weight="800">
          {gap.area}
        </T>
        <Badge tone="warning">BOŞ</Badge>
      </View>
      <T size={13} color={colors.muted}>
        {gap.teacherName} bu gün izinli.
      </T>
      {canAssign ? (
        <>
          <T size={13} weight="700">
            Önerilenler · o gün nöbeti olmayan, bu ay en az nöbet tutanlar
          </T>
          {day.candidates.slice(0, 4).map((c) => (
            <View key={c.teacherId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: colors.primarySoft }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                  {c.fullName
                    .split(' ')
                    .map((p) => p.charAt(0))
                    .slice(0, 2)
                    .join('')}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <T weight="700">{c.fullName}</T>
                <T size={12} color={colors.muted}>
                  Bu ay ~{c.monthCount} nöbet
                </T>
              </View>
              <Button size="sm" loading={busy === c.teacherId} onPress={() => void assign(c.teacherId)} style={{ paddingHorizontal: 14 }}>
                Ata
              </Button>
            </View>
          ))}
          {!day.candidates.length && <T color={colors.muted}>Uygun öğretmen bulunamadı.</T>}
          {error && <T color={colors.danger}>{error}</T>}
          <T size={12} color={colors.muted}>
            Atanan öğretmene bildirim gider, pano hemen güncellenir.
          </T>
        </>
      ) : (
        <T size={13} color={colors.muted}>
          Görevlendirmeyi nöbet yetkisi olan yönetici yapar.
        </T>
      )}
    </Card>
  );
}
