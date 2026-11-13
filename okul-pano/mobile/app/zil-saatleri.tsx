import {
  addIsoDays,
  bellClassDays,
  classSetLabel,
  compareClassNames,
  dayBells,
  errorText,
  isoWeekday,
  lessonCounts,
  missingLessonCounts,
  scheduleLessonCount,
  schoolDay,
  schoolLessonCounts,
  setGapAfter,
  sortPeriods,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  type DayBell,
  type Period,
  type SchoolCalendar,
  type Shift,
} from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { deriveRule, fromRule, gapMin, PeriodList, ScheduleEditorSheet, type BellScheduleRow, type ClassRow, type EditorValue } from '../src/bellEditor.tsx';
import { useSchoolInfo, useSchoolQuery, useUpcomingHolidays, type HolidayList } from '../src/data.ts';
import { Sheet, SheetScroll } from '../src/sheet.tsx';
import { Text } from '../src/text.tsx';
import { colors } from '../src/theme.ts';
import { Button, Card, Chip, confirm, DeleteIconButton, EditIconButton, Empty, Field, Icon, Loading, Screen, Segmented, T } from '../src/ui.tsx';

interface OverrideRow {
  id: string;
  date: string;
  target: string;
  periods: Period[];
  note: string | null;
  createdByName: string | null;
}
interface TimetableRow {
  weekday: number;
  periodNo: number;
  classId?: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const localIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const longDate = (iso: string) => `${dayNum(iso)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${WEEKDAY_NAMES[isoWeekday(iso)]}`;
const shiftOfSchedule = (s: Pick<BellScheduleRow, 'shift'>): Shift => (s.shift === 'afternoon' ? 'afternoon' : 'morning');

/**
 * Zil Saatleri (mobil, tasarım A + C): eğitim düzeni (tam gün / ikili eğitim), haftanın günleri, seçili günün zili,
 * o güne elle müdahale, zil düzenleri (telefondan oluşturma ve düzenleme), elle müdahaleler, zil hesabına
 * katılmayan sınıflar. Kurallar web panelindeki Zil Saatleri ile aynıdır.
 */
export default function ZilSaatleri() {
  const { can, school } = useAuth();
  const qc = useQueryClient();
  const editable = can('schedule.manage');
  const schoolPath = useSchoolPath();
  const schedules = useSchoolQuery<BellScheduleRow[]>('bell-schedules');
  const classes = useSchoolQuery<ClassRow[]>('classes');
  const timetable = useSchoolQuery<TimetableRow[]>('timetable');
  const overrides = useSchoolQuery<OverrideRow[]>('bell-overrides', { enabled: editable });
  const info = useSchoolInfo();
  const upcoming = useUpcomingHolidays();
  const settings = (info.data?.settings ?? {}) as { dualShift?: boolean; halfDayEnd?: string; lunchThresholdMin?: number };
  const dual = Boolean(settings.dualShift);
  const lunchThresholdMin = settings.lunchThresholdMin ?? 30;
  const [shiftTab, setShiftTab] = useState<Shift>('morning');
  const shift: Shift = dual ? shiftTab : 'morning';
  const [weekOffset, setWeekOffset] = useState(0);
  const [selDate, setSelDate] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNowTick(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const todayIso = localIso(nowTick);
  const nowMin = nowTick.getHours() * 60 + nowTick.getMinutes();

  const all = schedules.data ?? [];
  const classList = classes.data ?? [];
  const inShift = all.filter((s) => shiftOfSchedule(s) === shift);
  const counts = useMemo(() => (timetable.data?.length ? lessonCounts(timetable.data, classList, dual) : null), [timetable.data, classList, dual]);
  const bellClasses = useMemo(() => (timetable.data?.length ? bellClassDays(timetable.data, classList) : null), [timetable.data, classList]);
  const todayWd = isoWeekday(todayIso);
  const weekendNoLessons = todayWd >= 6 && !counts?.[`${shift}:${todayWd}`];
  const monday = addIsoDays(todayIso, (weekendNoLessons ? 8 - todayWd : 1 - todayWd) + weekOffset * 7);
  const week = useSchoolQuery<HolidayList>(`holidays/upcoming?from=${monday}&days=6`);
  const halfDayEnd = settings.halfDayEnd ?? '13:00';
  const cal: SchoolCalendar = {
    schedules: all,
    holidays: [...(week.data?.holidays ?? []), ...(upcoming.data?.holidays ?? [])],
    halfDays: [...(week.data?.halfDays ?? []), ...(upcoming.data?.halfDays ?? [])],
    halfDayEnd,
    lessonCounts: counts,
    bellClasses,
    overrides: overrides.data ?? [],
    dualShift: dual,
  };
  const classShiftOf = (c: ClassRow): Shift => (dual && c.shift === 'afternoon' ? 'afternoon' : 'morning');
  const classById = new Map(classList.map((c) => [c.id, c]));
  const allNames = classList.map((c) => c.name);
  const weekdays = [1, 2, 3, 4, 5, ...[6, 7].filter((d) => counts?.[`${shift}:${d}`] || inShift.some((s) => s.weekdays.includes(d)))];
  const days = weekdays.map((d) => {
    const date = addIsoDays(monday, d - 1);
    const sd = schoolDay(date, cal, shift);
    const bells = sd.holiday ? [] : dayBells(date, cal).filter((b) => b.shift === shift);
    return { date, weekday: d, holiday: sd.holiday, halfDay: sd.halfDay, bells };
  });
  const selected = days.find((d) => d.date === selDate) ?? days.find((d) => d.date === todayIso) ?? days.find((d) => d.date >= todayIso) ?? days[0];
  const nameOf = (b: DayBell) => all.find((s) => s.id === b.scheduleId)?.name ?? (b.classIds ? 'Sınıfa özel zil' : 'Okul geneli zil');

  /** Eğitim düzeni kartı: grubun bugünkü (yoksa en uzun) okul geneli zilinden saatler */
  const summary = (sh: Shift) => {
    const todayBell = schoolDay(todayIso, cal, sh).holiday ? undefined : dayBells(todayIso, cal).find((b) => b.shift === sh && !b.classIds && b.periods.length);
    const fallback = all.filter((x) => shiftOfSchedule(x) === sh && !x.classIds?.length && x.periods.length).sort((a, b) => scheduleLessonCount(b) - scheduleLessonCount(a))[0];
    const ps = sortPeriods(todayBell?.periods ?? fallback?.periods ?? []);
    return {
      range: ps.length ? `${ps[0]!.start}–${ps.at(-1)!.end}` : null,
      name: todayBell ? `Bugün: ${nameOf(todayBell)}` : (fallback?.name ?? null),
      classCount: classList.filter((c) => !c.bellExempt && classShiftOf(c) === sh).length,
    };
  };

  const schoolCounts = schoolLessonCounts(cal);
  const autoSchool = inShift.filter((s) => !s.weekdays.length && !s.classIds?.length);
  const maxAuto = Math.max(0, ...autoSchool.map(scheduleLessonCount));
  const missing = schoolCounts ? missingLessonCounts(all, schoolCounts, shift).filter((n) => n > maxAuto) : [];

  const refresh = (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));
  const [message, setMessage] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string, keys: string[]) => {
    setMessage(null);
    try {
      await fn();
      await refresh(...keys);
      setMessage(ok);
    } catch (err) {
      setMessage(errorText(err, 'Kaydedilemedi'));
    }
  };

  // Eğitim düzeni ve sınıf seçimleri
  const setDual = (v: boolean) =>
    void run(() => api(schoolPath, { method: 'PATCH', body: { settings: { dualShift: v } } }), v ? 'İkili eğitim açıldı.' : 'Tam gün eğitime geçildi.', ['']).then(() => !v && setShiftTab('morning'));
  const [picker, setPicker] = useState<'afternoon' | 'exempt' | null>(null);
  const savePicker = async (picked: Set<string>) => {
    const path = `${schoolPath}/classes`;
    if (picker === 'afternoon') {
      await api(`${path}/shift`, { method: 'POST', body: { classIds: classList.filter((c) => picked.has(c.id)).map((c) => c.id), shift: 'afternoon' } });
      await api(`${path}/shift`, { method: 'POST', body: { classIds: classList.filter((c) => !picked.has(c.id) && c.shift === 'afternoon').map((c) => c.id), shift: 'morning' } });
    } else {
      await api(`${path}/bell-exempt`, { method: 'POST', body: { classIds: classList.filter((c) => picked.has(c.id) && !c.bellExempt).map((c) => c.id), exempt: true } });
      await api(`${path}/bell-exempt`, { method: 'POST', body: { classIds: classList.filter((c) => !picked.has(c.id) && c.bellExempt).map((c) => c.id), exempt: false } });
    }
    await refresh('classes');
    setPicker(null);
  };

  // Zil düzeni oluşturma ve düzenleme (C)
  const [editor, setEditor] = useState<{ title: string; id: string | null; value: EditorValue } | null>(null);
  const openNew = (count?: number) => {
    const base = autoSchool.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
    const rule = base ? deriveRule(base.periods) : null;
    const periods = count && rule ? fromRule({ ...rule, count, lunchAfter: rule.lunchAfter < count ? rule.lunchAfter : 0 }) : [];
    const suffix = dual ? (shift === 'afternoon' ? ' · Öğlenci' : ' · Sabahçı') : '';
    setEditor({ title: 'Yeni zil düzeni', id: null, value: { name: count ? `${count} derslik gün${suffix}` : '', lessonCount: count ?? null, periods, weekdays: [], classIds: [] } });
  };
  const openEdit = (s: BellScheduleRow) => setEditor({ title: s.name, id: s.id, value: { name: s.name, lessonCount: s.lessonCount, periods: s.periods, weekdays: s.weekdays, classIds: s.classIds ?? [] } });
  const openCopy = (s: BellScheduleRow) => setEditor({ title: `"${s.name}" kopyası`, id: null, value: { name: `${s.name} (kopya)`, lessonCount: s.lessonCount, periods: s.periods, weekdays: [], classIds: s.classIds ?? [] } });
  const saveSchedule = async (v: EditorValue) => {
    const editing = editor?.id ? all.find((s) => s.id === editor.id) : null;
    const body = {
      name: v.name.trim(),
      periods: sortPeriods(v.periods),
      lessonCount: v.lessonCount ?? v.periods.length,
      weekdays: v.weekdays,
      shift: editing ? editing.shift : shift === 'afternoon' ? 'afternoon' : null,
      sortOrder: editing?.sortOrder ?? all.length,
      classIds: v.classIds.length ? v.classIds : null,
    };
    const path = `${schoolPath}/bell-schedules`;
    if (editing) await api(`${path}/${editing.id}`, { method: 'PUT', body });
    else await api(path, { method: 'POST', body });
    // Okul geneli bir güne tek düzen sabitlenir: aynı günü tutan öteki okul geneli düzenlerden o gün kaldırılır (web ile aynı)
    if (!body.classIds && body.weekdays.length) {
      for (const s of inShift.filter((x) => x.id !== editing?.id && !x.classIds?.length && x.weekdays.some((d) => body.weekdays.includes(d)))) {
        await api(`${path}/${s.id}`, {
          method: 'PUT',
          body: { name: s.name, periods: s.periods, lessonCount: s.lessonCount, shift: s.shift, sortOrder: s.sortOrder, weekdays: s.weekdays.filter((d) => !body.weekdays.includes(d)), classIds: null },
        });
      }
    }
    await refresh('bell-schedules');
    setEditor(null);
    setMessage(editing ? 'Zil düzeni kaydedildi; panolar güncellendi.' : 'Zil düzeni oluşturuldu; panolar güncellendi.');
  };
  const removeSchedule = async (s: BellScheduleRow) => {
    const used = days.filter((d) => d.bells.some((b) => b.scheduleId === s.id)).map((d) => WEEKDAY_NAMES[d.weekday]);
    const ok = await confirm({
      title: 'Zil düzeni silinsin mi?',
      subtitle: s.name,
      effects: [
        { text: used.length ? `${used.join(', ')} günleri başka bir zil düzenine geçer` : 'Bu hafta bu zili kullanan gün yok' },
        { text: 'Ders programı ve elle müdahaleler silinmez', ok: true },
      ],
      confirmLabel: 'Sil',
      tone: 'danger',
    });
    if (ok) void run(() => api(`${schoolPath}/bell-schedules/${s.id}`, { method: 'DELETE' }), 'Zil düzeni silindi.', ['bell-schedules']);
  };

  // Bu günü düzenle (A3)
  const [dayEdit, setDayEdit] = useState(false);
  const removeOverride = (o: OverrideRow) => void run(() => api(`${schoolPath}/bell-overrides/${o.id}`, { method: 'DELETE' }), 'Geri alındı; düzenin saatleri geçerli.', ['bell-overrides']);

  const scheduleScope = (s: BellScheduleRow) => {
    const who = s.classIds?.length ? classSetLabel(s.classIds.map((id) => classById.get(id)?.name ?? '').filter(Boolean), allNames) : 'Okul geneli';
    const n = scheduleLessonCount(s);
    const lower = s.classIds?.length || s.weekdays.length ? n : Math.max(0, ...autoSchool.map(scheduleLessonCount).filter((x) => x < n)) + 1;
    const when = s.weekdays.length ? s.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ') : lower < n ? `${lower}–${n} dersli günler` : `${n} dersli günler`;
    const ps = sortPeriods(s.periods);
    return `${who} · ${when} · ${ps[0]?.start ?? ''}–${ps.at(-1)?.end ?? ''}`;
  };
  const usedOn = (s: BellScheduleRow) => days.filter((d) => d.bells.some((b) => b.scheduleId === s.id)).map((d) => WEEKDAY_SHORT[d.weekday]!);

  const loading = schedules.isLoading || classes.isLoading || timetable.isLoading || info.isLoading;
  const history = [...(overrides.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const sel = selected;
  const mainBell = sel?.bells.find((b) => !b.classIds) ?? null;
  const specialBells = sel?.bells.filter((b) => b.classIds) ?? [];
  const isToday = sel?.date === todayIso;

  return (
    <Screen
      back
      title="Zil Saatleri"
      refreshing={schedules.isRefetching}
      onRefresh={() => void Promise.all([schedules.refetch(), overrides.refetch(), classes.refetch()])}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {message && <T size={13} color={colors.muted}>{message}</T>}

          {/* Eğitim düzeni (A1): tam gün / ikili eğitim; grup kartları aynı zamanda seçici */}
          <Card style={{ gap: 10 }}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.faint, letterSpacing: 0.4 }}>EĞİTİM DÜZENİ</Text>
            {editable ? (
              <Segmented
                value={dual ? 'half' : 'full'}
                onChange={(v) => v !== (dual ? 'half' : 'full') && setDual(v === 'half')}
                options={[
                  { value: 'full', label: 'Tam gün' },
                  { value: 'half', label: 'Yarım gün' },
                ]}
              />
            ) : (
              <T weight="700">{dual ? 'Yarım gün (ikili eğitim)' : 'Tam gün'}</T>
            )}
            {dual ? (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['morning', 'afternoon'] as const).map((sh) => {
                    const sum = summary(sh);
                    const m = sh === 'morning';
                    const on = shift === sh;
                    return (
                      <Pressable
                        key={sh}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                        onPress={() => setShiftTab(sh)}
                        style={{ flex: 1, borderRadius: 16, padding: 10, borderWidth: 2, borderColor: on ? (m ? colors.gold : colors.info) : 'transparent', backgroundColor: m ? colors.goldSoft : colors.infoSoft }}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: m ? colors.gold : colors.info }}>
                          {m ? 'SABAHÇI' : 'ÖĞLENCİ'} · {sum.classCount} SINIF
                        </Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 2 }}>{sum.range ?? 'Zil yok'}</Text>
                        <Text style={{ fontSize: 10.5, color: colors.faint }} numberOfLines={1}>
                          {sum.name ?? (m ? 'Bütün sınıflar' : 'Öğlenci sınıf seçin')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {editable && (
                  <Button variant="secondary" size="sm" icon="people-outline" onPress={() => setPicker('afternoon')}>
                    Öğlenci sınıfları seç
                  </Button>
                )}
              </>
            ) : (
              <T size={12.5} color={colors.faint}>
                Bütün sınıflar aynı zil{summary('morning').range ? ` · ${summary('morning').range}` : ''}
              </T>
            )}
          </Card>

          {/* Tatil / arife açıklaması */}
          {sel?.holiday ? (
            <Card tone="warning">
              <T size={13} weight="700">{`${longDate(sel.date)}: ${sel.holiday}. Zil çalmaz.`}</T>
            </Card>
          ) : sel?.halfDay ? (
            <Card tone="warning">
              <T size={13} weight="700">{`${longDate(sel.date)} ${sel.halfDay} (yarım gün): son zil ${halfDayEnd}. Bu saatten sonra başlayan dersler yapılmaz.`}</T>
            </Card>
          ) : null}

          {/* Haftanın günleri */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Önceki hafta" disabled={weekOffset <= 0} hitSlop={8} onPress={() => setWeekOffset((w) => w - 1)} style={{ opacity: weekOffset <= 0 ? 0.3 : 1, padding: 4 }}>
              <Icon name="chevron-back" size={20} />
            </Pressable>
            <T size={13} weight="700" color={colors.muted}>{`${dayNum(monday)} ${MONTHS[Number(monday.slice(5, 7)) - 1]} haftası`}</T>
            <Pressable accessibilityRole="button" accessibilityLabel="Sonraki hafta" disabled={weekOffset >= 8} hitSlop={8} onPress={() => setWeekOffset((w) => w + 1)} style={{ padding: 4 }}>
              <Icon name="chevron-forward" size={20} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {days.map((d) => {
              const on = d.date === sel?.date;
              const main = d.bells.find((b) => !b.classIds);
              const sub = d.holiday ? 'tatil' : d.halfDay ? 'arife' : d.date === todayIso ? 'bugün' : main ? `${main.periods.length} ders` : '—';
              return (
                <Pressable
                  key={d.date}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${WEEKDAY_NAMES[d.weekday]} ${dayNum(d.date)}, ${sub}`}
                  onPress={() => setSelDate(d.date)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    borderRadius: 14,
                    paddingVertical: 7,
                    borderWidth: 1,
                    backgroundColor: on ? colors.primary : d.holiday ? colors.warningSoft : colors.card,
                    borderColor: on ? colors.primary : d.holiday ? colors.warningBorder : colors.border,
                  }}
                >
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: on ? colors.onPrimary : colors.faint }}>{WEEKDAY_SHORT[d.weekday]!.toLocaleUpperCase('tr-TR')}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: on ? colors.onPrimary : colors.ink }}>{dayNum(d.date)}</Text>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: on ? colors.onPrimary : d.holiday ? colors.warning : colors.faint }}>{sub}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Seçili günün zili */}
          {sel && !sel.holiday && (
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <T weight="800">{`${WEEKDAY_NAMES[sel.weekday]} · ${mainBell ? nameOf(mainBell) : 'zil yok'}`}</T>
                  <T size={12} color={colors.faint}>
                    {mainBell?.periods.length ? `${dual ? (shift === 'afternoon' ? 'Öğlenci' : 'Sabahçı') + ' · ' : ''}${sortPeriods(mainBell.periods)[0]!.start}–${sortPeriods(mainBell.periods).at(-1)!.end}${mainBell.overridden ? ' · bugüne özel saatler' : ''}` : 'Bu gün için zil düzeni yok'}
                  </T>
                </View>
                {editable && mainBell && sel.date >= todayIso && (
                  <Button size="sm" variant="delete" icon="hand-stop" onPress={() => setDayEdit(true)}>
                    Bu günü düzenle
                  </Button>
                )}
              </View>
              {mainBell?.periods.length ? (
                <PeriodList
                  periods={mainBell.periods}
                  lunchThresholdMin={lunchThresholdMin}
                  nowNo={isToday ? (sortPeriods(mainBell.periods).find((p) => toMin(p.start) <= nowMin && nowMin < toMin(p.end))?.no ?? null) : null}
                  pastNos={isToday ? new Set(mainBell.periods.filter((p) => toMin(p.end) <= nowMin).map((p) => p.no)) : undefined}
                  note={(p) => (isToday && toMin(p.start) <= nowMin && nowMin < toMin(p.end) ? `Şu an · ${toMin(p.end) - nowMin} dk kaldı` : null)}
                />
              ) : null}
              {specialBells.map((b) => (
                <View key={b.target} style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.warningSoft }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '800', color: colors.warning }}>sınıfa özel</Text>
                    </View>
                    <T size={13} weight="700">{`${nameOf(b)} · ${classSetLabel((b.classIds ?? []).map((id) => classById.get(id)?.name ?? '').filter(Boolean), allNames)}`}</T>
                  </View>
                  <PeriodList periods={b.periods} lunchThresholdMin={lunchThresholdMin} />
                </View>
              ))}
            </Card>
          )}

          {/* Zil düzenleri (A2) */}
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T weight="800">{`Zil düzenleri${dual ? (shift === 'afternoon' ? ' · Öğlenci' : ' · Sabahçı') : ''}`}</T>
              {editable && (
                <Button size="sm" icon="add" onPress={() => openNew()}>
                  Yeni
                </Button>
              )}
            </View>
            {!inShift.length && <Empty icon="notifications-outline" title="Zil düzeni yok" text="Yeni ile ilk ders saati, ders ve teneffüs sürelerini girip düzeni oluşturun." />}
            {[...inShift]
              .sort((a, b) => Number(Boolean(a.classIds?.length)) - Number(Boolean(b.classIds?.length)) || Number(Boolean(a.weekdays.length)) - Number(Boolean(b.weekdays.length)) || scheduleLessonCount(a) - scheduleLessonCount(b))
              .map((s, i) => {
                const special = Boolean(s.classIds?.length);
                const used = usedOn(s);
                return (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T weight="800" lines={1}>{s.name}</T>
                      <T size={11.5} color={colors.faint}>{scheduleScope(s)}</T>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {special && (
                          <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: colors.warningSoft }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.warning }}>sınıfa özel</Text>
                          </View>
                        )}
                        {used.map((d) => (
                          <View key={d} style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: colors.primarySoft }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.muted }}>{d}</Text>
                          </View>
                        ))}
                        {!used.length && <Text style={{ fontSize: 10.5, color: colors.faint }}>Bu hafta çalmıyor</Text>}
                      </View>
                    </View>
                    {editable && (
                      <>
                        <EditIconButton label={`${s.name}: düzenle`} onPress={() => openEdit(s)} />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${s.name}: kopyala`}
                          onPress={() => openCopy(s)}
                          style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.6 : 1 })}
                        >
                          <Icon name="albums-outline" size={17} color={colors.muted} />
                        </Pressable>
                        <DeleteIconButton label={`${s.name}: sil`} onPress={() => void removeSchedule(s)} />
                      </>
                    )}
                  </View>
                );
              })}
            {editable && missing.length > 0 && (
              <Card tone="warning" style={{ gap: 8, marginTop: 6 }}>
                <T size={12.5} weight="700">{`Programda ${missing.map((n) => `${n} dersli`).join(', ')} gün var ama düzeni yok. Şimdilik bir büyük düzen kullanılıyor.`}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {missing.map((n) => (
                    <Button key={n} size="sm" variant="secondary" icon="add" onPress={() => openNew(n)}>
                      {`${n} derslik gün`}
                    </Button>
                  ))}
                </View>
              </Card>
            )}
          </Card>

          {/* Elle müdahaleler */}
          {editable && (
            <Card style={{ gap: 4 }}>
              <T weight="800">Elle müdahaleler</T>
              <T size={12} color={colors.faint}>Yalnızca o gün için değiştirilen saatler</T>
              {history.map((o) => (
                <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <T size={13.5} weight="800">{longDate(o.date)}</T>
                    <T size={11.5} color={colors.faint}>
                      {[o.target.startsWith('school:') ? 'Okul geneli' : (all.find((s) => `schedule:${s.id}` === o.target)?.name ?? 'Silinmiş düzen'), o.note, o.createdByName].filter(Boolean).join(' · ')}
                    </T>
                  </View>
                  {o.date >= todayIso && (
                    <Button size="sm" variant="secondary" onPress={() => removeOverride(o)}>
                      Geri al
                    </Button>
                  )}
                </View>
              ))}
              {!history.length && <T size={12.5} color={colors.subtle}>Henüz yok. Bir gün seçip "Bu günü düzenle" ile başlayın.</T>}
            </Card>
          )}

          {/* Zil hesabına katılmayan sınıflar */}
          <Card style={{ gap: 6 }}>
            <T weight="800">Zil hesabına katılmayan sınıflar</T>
            <T size={12} color={colors.faint}>Günün ders sayısını belirlemezler (ör. özel eğitim); zil onlar için de aynı çalar.</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {classList.filter((c) => c.bellExempt).map((c) => (
                <Chip key={c.id} label={c.name} />
              ))}
              {!classList.some((c) => c.bellExempt) && <T size={12.5} color={colors.subtle}>Yok.</T>}
              {editable && <Chip icon="create-outline" label="Düzenle" onPress={() => setPicker('exempt')} />}
            </View>
          </Card>

          <T size={12} color={colors.subtle} style={{ textAlign: 'center' }}>
            Zil düzenleri web panelindeki Zil Saatleri ile aynıdır; bir yerde yapılan değişiklik öbüründe ve panolarda görünür.
          </T>
        </>
      )}

      {editor && (
        <ScheduleEditorSheet
          open
          title={editor.title}
          initial={editor.value}
          classes={classList}
          shift={shift}
          dual={dual}
          lunchThresholdMin={lunchThresholdMin}
          onClose={() => setEditor(null)}
          onSave={saveSchedule}
        />
      )}
      {sel && mainBell && (
        <DayEditSheet
          open={dayEdit}
          date={sel.date}
          isToday={isToday}
          bell={mainBell}
          options={inShift.filter((s) => !s.classIds?.length && s.periods.length)}
          lunchThresholdMin={lunchThresholdMin}
          existing={(overrides.data ?? []).find((o) => o.date === sel.date && o.target === mainBell.target) ?? null}
          onClose={() => setDayEdit(false)}
          onSave={async (periods, note) => {
            if (periods) await api(`${schoolPath}/bell-overrides`, { method: 'PUT', body: { date: sel.date, target: mainBell.target, periods, note: note || null, notify: false } });
            else {
              const ex = (overrides.data ?? []).find((o) => o.date === sel.date && o.target === mainBell.target);
              if (ex) await api(`${schoolPath}/bell-overrides/${ex.id}`, { method: 'DELETE' });
            }
            await refresh('bell-overrides');
            setDayEdit(false);
            setMessage(periods ? 'Bu günün zil saatleri kaydedildi; panolar güncellendi.' : 'Düzenin saatlerine dönüldü.');
          }}
        />
      )}
      <ClassPickSheet
        open={picker !== null}
        title={picker === 'afternoon' ? 'Öğlenci sınıflar' : 'Zil hesabına katılmayan sınıflar'}
        classes={classList}
        initial={new Set(classList.filter((c) => (picker === 'afternoon' ? c.shift === 'afternoon' : c.bellExempt)).map((c) => c.id))}
        onClose={() => setPicker(null)}
        onSave={savePicker}
      />
    </Screen>
  );
}

/**
 * Bu günü düzenle (A3): yalnızca o gün için; aralar ±5 dk, ders iptali (dokununca) ya da o güne başka bir düzenin
 * saatleri. Not yazılır; ertesi gün düzen kendiliğinden geri gelir.
 */
function DayEditSheet({ open, date, isToday, bell, options, lunchThresholdMin, existing, onClose, onSave }: {
  open: boolean;
  date: string;
  isToday: boolean;
  bell: DayBell;
  options: BellScheduleRow[];
  lunchThresholdMin: number;
  existing: OverrideRow | null;
  onClose: () => void;
  onSave: (periods: Period[] | null, note: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'shift' | 'other'>('shift');
  const [periods, setPeriods] = useState<Period[]>(bell.periods);
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setMode('shift');
    setPeriods(sortPeriods(bell.periods));
    setNote(existing?.note ?? '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const base = sortPeriods(bell.basePeriods);
  const changed = JSON.stringify(sortPeriods(periods)) !== JSON.stringify(base);
  const save = async (p: Period[] | null) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(p, note);
    } catch (err) {
      setError(errorText(err, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetScroll contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{`${longDate(date)}${isToday ? ' · bugün' : ''}`}</Text>
        <T size={12.5} color={colors.faint}>Değişiklik yalnızca bu gün için; ertesi gün düzen geri gelir.</T>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'shift', label: 'Saatleri kaydır' },
            { value: 'other', label: 'Başka düzen' },
          ]}
        />
        {mode === 'shift' ? (
          <>
            <T size={12} color={colors.muted}>Araların yanındaki −5 / +5 ile kaydırın; bir derse dokunursanız o gün iptal olur.</T>
            <PeriodList
              elevated
              periods={periods}
              lunchThresholdMin={lunchThresholdMin}
              gapControls={(afterNo, delta) => {
                const ps = sortPeriods(periods);
                const i = ps.findIndex((p) => p.no === afterNo);
                const next = ps[i + 1];
                if (!next) return;
                setPeriods(setGapAfter(ps, afterNo, Math.max(0, gapMin(ps[i]!, next) + delta)));
              }}
              onPeriod={(p) => {
                if (periods.length <= 1) return;
                setPeriods(periods.filter((x) => x.no !== p.no));
              }}
            />
            {periods.length < base.length && (
              <T size={12} color={colors.warning}>{`İptal: ${base.filter((p) => !periods.some((x) => x.no === p.no)).map((p) => `${p.no}. ders`).join(', ')}`}</T>
            )}
          </>
        ) : (
          <View style={{ gap: 6 }}>
            <T size={12} color={colors.muted}>Seçilen düzenin saatleri yalnızca bu gün çalar.</T>
            {options.map((s) => {
              const ps = sortPeriods(s.periods);
              const on = JSON.stringify(ps) === JSON.stringify(sortPeriods(periods));
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setPeriods(ps)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: colors.card, borderRadius: 14, padding: 10 }}
                >
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: on ? 6 : 2, borderColor: on ? colors.primary : colors.subtle }} />
                  <View style={{ flex: 1 }}>
                    <T size={13.5} weight="800">{s.name}</T>
                    <T size={11.5} color={colors.faint}>{`${ps[0]?.start ?? ''}–${ps.at(-1)?.end ?? ''} · ${ps.length} ders`}</T>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        <Field label="Not (panoda görünmez)" value={note} onChangeText={setNote} placeholder="Tören nedeniyle 2. teneffüs uzun" maxLength={200} />
        {error && <T color={colors.danger}>{error}</T>}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={onClose}>
            Vazgeç
          </Button>
          <Button style={{ flex: 1 }} loading={busy} disabled={!changed && !existing} onPress={() => void save(changed ? sortPeriods(periods) : null)}>
            {changed ? 'Bu gün için kaydet' : 'Düzene dön'}
          </Button>
        </View>
      </SheetScroll>
    </Sheet>
  );
}

/** Sınıf seçimi (öğlenci sınıflar, zil hesabına katılmayanlar) */
function ClassPickSheet({ open, title, classes, initial, onClose, onSave }: { open: boolean; title: string; classes: ClassRow[]; initial: Set<string>; onClose: () => void; onSave: (picked: Set<string>) => Promise<void> }) {
  const [picked, setPicked] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setPicked(new Set(initial));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const sorted = [...classes].sort((a, b) => compareClassNames(a.name, b.name));
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetScroll contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{title}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {sorted.map((c) => {
            const on = picked.has(c.id);
            return (
              <Chip
                key={c.id}
                label={c.name}
                selected={on}
                onPress={() => {
                  const n = new Set(picked);
                  if (on) n.delete(c.id);
                  else n.add(c.id);
                  setPicked(n);
                }}
              />
            );
          })}
          {!sorted.length && <T color={colors.muted}>Sınıf yok.</T>}
        </View>
        {error && <T color={colors.danger}>{error}</T>}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={onClose}>
            Vazgeç
          </Button>
          <Button
            style={{ flex: 1 }}
            loading={busy}
            onPress={() => {
              setBusy(true);
              void onSave(picked)
                .catch((err) => setError(errorText(err, 'Kaydedilemedi')))
                .finally(() => setBusy(false));
            }}
          >
            Kaydet
          </Button>
        </View>
      </SheetScroll>
    </Sheet>
  );
}

