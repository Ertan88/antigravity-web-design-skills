import { examGroupPeriods, examRoles, groupExams, type ExamGroup, type ScheduledExam } from '@okulpano/shared/examCore';
import { compareClassNames, parseClassName } from '@okulpano/shared/grade';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useExamSchedule, useMeToday, useNow } from '../src/data.ts';
import { dayTitle, localIso } from '../src/day.ts';
import { colors, tiles, type TileTone } from '../src/theme.ts';
import { Text } from '../src/text.tsx';
import { Card, Chip, Empty, ErrorNote, Icon, Loading, Screen, Segmented, T } from '../src/ui.tsx';

/*
 * Sınav takvimi: gün şeridi (sınavı olan günlerde nokta) ve "Benim / Tüm okul / Sınıf" süzgeci. Saat, o sınıfın
 * zilinden hesaplanmış gelir. Öğretmenin rolü (gözetmen / dersin öğretmeni) satırda yazar.
 */

type Filter = 'mine' | 'all' | 'class';
const DAY = 86400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const SHORT = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];


/** Görünen sınıf adı; eski sunucu sürümü bu alanı göndermezse sınıfın tam adı */
const labelOf = (e: Pick<ScheduledExam, 'className'> & { classLabel?: string }) => e.classLabel || e.className;

/** Kademe anahtarı ve adı: "9" → "9. Sınıflar", "ATP 10" → "ATP 10. Sınıflar"; tanınmayan ad kendisi */
const levelOf = (name: string): { key: string; label: string } => {
  const p = parseClassName(name);
  if (!p) return { key: `#${name}`, label: name };
  const key = `${p.program ? `${p.program} ` : ''}${p.grade}`;
  return { key, label: `${key}. Sınıflar` };
};
const mondayOf = (iso: string) => addDays(iso, 1 - weekday(iso));
/** Haftanın dersleri sırayla renk alır (web ızgarasıyla aynı kural) */
const WEEK_TONES: TileTone[] = ['sky', 'mint', 'peach', 'lilac', 'sun', 'rose'];

export default function SinavTakvimi() {
  const q = useExamSchedule();
  const me = useMeToday();
  const teacherId = me.data?.teacher?.id ?? null;
  const [filter, setFilter] = useState<Filter | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  // Bildirimden gelindiyse (?gun=YYYY-AA-GG) o gün seçili açılır
  const { gun } = useLocalSearchParams<{ gun?: string }>();
  const [picked, setPicked] = useState<string | null>(null);
  // Parametre ilk çizimde henüz hazır olmayabilir: gelince (ya da değişince) o gün seçilir
  useEffect(() => {
    if (gun && /^\d{4}-\d{2}-\d{2}$/.test(gun)) setPicked(gun);
  }, [gun]);
  const active: Filter = filter ?? (teacherId ? 'mine' : 'all');
  // Gün | Hafta: haftada kademe seçilir, Pazartesi–Cuma alt alta
  const [view, setView] = useState<'day' | 'week'>('day');
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);

  const today = q.data?.today ?? localIso();
  const all = q.data?.exams ?? [];
  const classes = useMemo(() => [...new Map(all.map((e) => [e.classGroupId, labelOf(e)])).entries()].sort((a, b) => compareClassNames(a[1], b[1])), [all]);
  const shown = all.filter((e) => {
    if (active === 'mine') {
      const r = examRoles(e, teacherId);
      return r.proctor || r.subject;
    }
    if (active === 'class') return !classId || e.classGroupId === classId;
    return true;
  });
  const examDays = new Set(shown.map((e) => e.date));
  // Gün şeridi: önümüzdeki 4 haftanın hafta içi günleri (hafta sonu sınavı varsa o gün de)
  const strip = Array.from({ length: 28 }, (_, i) => addDays(today, i)).filter((d) => weekday(d) <= 5 || examDays.has(d));
  const firstWithExam = strip.find((d) => examDays.has(d));
  const selected = picked ?? (examDays.has(today) ? today : (firstWithExam ?? today));
  const dayExams = shown.filter((e) => e.date === selected).sort((a, b) => a.periodNo - b.periodNo || compareClassNames(a.className, b.className));
  const later = shown.filter((e) => e.date > strip[strip.length - 1]!);

  const monday = weekStart ?? mondayOf(today);
  const weekDays = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  const weekExams = all.filter((e) => e.date >= monday && e.date <= addDays(monday, 6));
  for (const extra of [5, 6]) if (weekExams.some((e) => e.date === addDays(monday, extra))) weekDays.push(addDays(monday, extra));
  const levels = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of all) {
      const l = levelOf(labelOf(e));
      map.set(l.key, l.label);
    }
    return [...map].sort((a, b) => compareClassNames(a[0], b[0]));
  }, [all]);
  const activeLevel = level && levels.some(([k]) => k === level) ? level : (levels[0]?.[0] ?? null);
  const subjects = [...new Set(weekExams.map((e) => e.subject.trim().toLocaleLowerCase('tr-TR')))].sort((a, b) => a.localeCompare(b, 'tr'));
  const toneOf = (subject: string) => tiles[WEEK_TONES[Math.max(0, subjects.indexOf(subject.trim().toLocaleLowerCase('tr-TR'))) % WEEK_TONES.length]!];
  const friday = weekDays[Math.min(4, weekDays.length - 1)]!;
  // "9 – 13 Kasım"; ay değişiyorsa "30 Kasım – 4 Aralık"
  const weekLabel = `${monday.slice(0, 7) === friday.slice(0, 7) ? Number(monday.slice(8, 10)) : dayTitle(monday, { day: 'numeric', month: 'long' })} – ${dayTitle(friday, { day: 'numeric', month: 'long' })}`;

  return (
    <Screen back title="Sınav takvimi" subtitle="Yazılı, uygulama ve ortak sınavlar" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <ErrorNote error={q.error} />
      {q.isLoading ? (
        <Loading />
      ) : (
        <>
          <Segmented
            value={view}
            onChange={(v) => setView(v)}
            options={[
              { value: 'day' as const, label: 'Gün' },
              { value: 'week' as const, label: 'Hafta' },
            ]}
          />
          {view === 'week' ? (
            <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Önceki hafta" onPress={() => setWeekStart(addDays(monday, -7))} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <Icon name="chevron-back" size={18} color={colors.ink} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setWeekStart(null)} style={{ paddingHorizontal: 14, height: 40, borderRadius: 20, justifyContent: 'center', backgroundColor: monday === mondayOf(today) ? colors.primary : colors.card, borderWidth: 1, borderColor: monday === mondayOf(today) ? colors.primary : colors.border }}>
              <T size={13} weight="700" color={monday === mondayOf(today) ? colors.onPrimary : colors.ink}>
                Bu hafta
              </T>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Sonraki hafta" onPress={() => setWeekStart(addDays(monday, 7))} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <Icon name="chevron-forward" size={18} color={colors.ink} />
            </Pressable>
            <T size={13.5} weight="700" color={colors.muted} style={{ flex: 1 }} lines={1}>
              {weekLabel}
            </T>
          </View>
          {levels.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, alignItems: 'flex-start' }}>
              {levels.map(([k, label]) => (
                <Chip key={k} label={label} selected={activeLevel === k} onPress={() => setLevel(k)} />
              ))}
            </ScrollView>
          )}
          <Card style={{ paddingVertical: 2, gap: 0 }}>
            {weekDays.map((d, i) => {
              const dayGroups = groupExams(weekExams.filter((e) => e.date === d && levelOf(labelOf(e)).key === activeLevel).sort((a, b) => a.periodNo - b.periodNo));
              return (
                <View key={d} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.divider }}>
                  <View style={{ width: 48 }}>
                    <T size={14} weight="800" color={dayGroups.length ? colors.ink : colors.subtle}>
                      {SHORT[weekday(d)]}
                    </T>
                    <T size={11.5} color={d === today ? colors.danger : colors.faint} weight={d === today ? '700' : '400'}>
                      {d === today ? 'Bugün' : Number(d.slice(8, 10))}
                    </T>
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    {dayGroups.length ? (
                      dayGroups.map((g) => {
                        const first = g.items[0]!;
                        const t = toneOf(first.subject);
                        const multi = g.items.length > 1;
                        const sections = g.classNames.map((n) => parseClassName(n)?.section ?? n);
                        const mine = g.items.some((x) => {
                          const r = examRoles(x, teacherId);
                          return r.proctor || r.subject;
                        });
                        return (
                          <Pressable
                            key={g.key}
                            accessibilityRole="button"
                            onPress={() => {
                              setView('day');
                              setFilter('all');
                              setPicked(d);
                            }}
                            style={({ pressed }) => ({ backgroundColor: t.bg, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7, opacity: pressed ? 0.7 : 1 })}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <T size={14} weight="800" color={t.fg} style={{ flex: 1 }} lines={2}>
                                {first.subject}
                              </T>
                              {mine && <Icon name="person" size={14} color={t.fg} />}
                              {g.items.some((x) => x.warnings.length > 0) && <Icon name="warning-outline" size={14} color={colors.warning} />}
                            </View>
                            <T size={12} weight="600" color={t.fg} style={{ opacity: 0.85 }}>
                              {g.samePeriod ? `${first.periodNo}. ders` : examGroupPeriods(g)} · {multi ? sections.join(', ') : `Yalnız ${g.classNames[0]}`}
                            </T>
                          </Pressable>
                        );
                      })
                    ) : (
                      <T size={13.5} color={colors.subtle} style={{ paddingTop: 2 }}>
                        Sınav yok
                      </T>
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
          <T size={12} color={colors.faint} style={{ textAlign: 'center' }}>
            Bir sınava dokununca o günün listesi açılır.
          </T>
            </>
          ) : (
            <>
          <Segmented
            value={active}
            onChange={(v) => {
              setFilter(v);
              setPicked(null);
            }}
            options={[...(teacherId ? [{ value: 'mine' as const, label: 'Benim' }] : []), { value: 'all' as const, label: 'Tüm okul' }, { value: 'class' as const, label: 'Sınıf' }]}
          />
          {active === 'class' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, alignItems: 'flex-start' }}>
              {classes.length ? (
                classes.map(([id, name]) => <Chip key={id} label={name} selected={classId === id} onPress={() => setClassId(classId === id ? null : id)} />)
              ) : (
                <T size={13} color={colors.faint}>
                  Sınavı olan sınıf yok
                </T>
              )}
            </ScrollView>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, alignItems: 'flex-start' }}>
            {strip.map((d) => {
              const on = d === selected;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${dayTitle(d)}${examDays.has(d) ? ', sınav var' : ''}`}
                  onPress={() => setPicked(d)}
                  style={{ width: 52, paddingVertical: 8, borderRadius: 16, alignItems: 'center', backgroundColor: on ? colors.primary : colors.card, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}
                >
                  <T size={11} weight="700" color={on ? colors.onPrimary : colors.muted}>
                    {d === today ? 'Bugün' : SHORT[weekday(d)]}
                  </T>
                  <T size={18} weight="800" color={on ? colors.onPrimary : colors.ink}>
                    {Number(d.slice(8, 10))}
                  </T>
                  <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 2, backgroundColor: examDays.has(d) ? (on ? colors.onPrimary : colors.danger) : 'transparent' }} />
                </Pressable>
              );
            })}
          </ScrollView>

          <T size={13} weight="800" color={colors.muted} style={{ marginTop: 4 }}>
            {dayTitle(selected).toLocaleUpperCase('tr-TR')}
          </T>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {dayExams.length ? (
              groupExams(dayExams).map((g, i) =>
                g.items.length === 1 ? (
                  <ExamRow key={g.key} exam={g.items[0]!} teacherId={teacherId} first={i === 0} />
                ) : (
                  <GroupRow key={g.key} group={g} teacherId={teacherId} first={i === 0} />
                ),
              )
            ) : (
              <Empty icon="clipboard-check" title="Bu gün sınav yok" text={active === 'mine' ? 'Gözetmen olduğunuz ya da dersinizin sınavı görünür.' : undefined} />
            )}
          </Card>

          {later.length > 0 && (
            <T size={12.5} color={colors.faint} style={{ textAlign: 'center' }}>
              4 haftadan sonra {later.length} sınav daha var.
            </T>
          )}
            </>
          )}
          {!all.length && <Empty icon="clipboard-check" title="Sınav takvimi boş" text="Sınavlar panelden (Sınav Takvimi) eklenir." />}
        </>
      )}
    </Screen>
  );
}

/**
 * Aynı kademenin şubelerindeki aynı sınav tek satır: "9. sınıflar · Matematik", altında şubeler ve gözetmen sayısı.
 * Dokununca şube şube saat ve gözetmen açılır.
 */
function GroupRow({ group: g, teacherId, first }: { group: ExamGroup<ScheduledExam>; teacherId: string | null; first: boolean }) {
  // Sınavdan önceki teneffüsün başından (bildirim anı) sınav bitene kadar kendiliğinden açık; kullanıcı kapatabilir
  const now = useNow(30_000).getTime();
  const starts = g.items.map((x) => (x.notifyAt ? Date.parse(x.notifyAt) : NaN)).filter((t) => !Number.isNaN(t));
  const ends = g.items.map((x) => (x.end ? new Date(`${x.date}T${x.end}:00`).getTime() : NaN)).filter((t) => !Number.isNaN(t));
  const auto = starts.length > 0 && ends.length > 0 && now >= Math.min(...starts) && now < Math.max(...ends);
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? auto;
  const setOpen = (v: boolean) => setToggled(v);
  const e = g.items[0]!;
  const mine = g.items.filter((x) => {
    const r = examRoles(x, teacherId);
    return r.proctor || r.subject;
  });
  const clocks = [...new Set(g.items.map((x) => x.start ?? '—'))];
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: colors.divider }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 58 }}>
          <T size={13.5} weight="800">
            {g.samePeriod ? `${e.periodNo}. ders` : 'Şubeye göre'}
          </T>
          <T size={11.5} color={colors.faint}>
            {g.samePeriod ? (clocks.length === 1 ? clocks[0] : 'şubeye göre') : examGroupPeriods(g)}
          </T>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={14.5} weight="800" lines={2}>
            {e.subject}
          </T>
          <T size={12.5} color={colors.muted} lines={2}>
            {mine.length > 0 && <Me>{`Sizin: ${mine.map((x) => labelOf(x)).join(', ')}`}</Me>}
            {mine.length > 0 ? ' · ' : ''}
            {g.label}
          </T>
        </View>
        {g.items.some((x) => x.warnings.length > 0) && <Icon name="warning-outline" size={16} color={colors.warning} />}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>
      {open && (
        <View style={{ paddingLeft: 14, marginBottom: 6, borderLeftWidth: 2, borderLeftColor: colors.divider }}>
          {g.items.map((x, i) => (
            <ExamRow key={x.id} exam={x} teacherId={teacherId} first={i === 0} sub />
          ))}
        </View>
      )}
    </View>
  );
}

/** Uygulamayı kullanan öğretmenin adı: farklı renkte ve belirgin */
function Me({ children }: { children: string }) {
  return <Text style={{ color: colors.info, fontWeight: '800', backgroundColor: colors.infoSoft }}>{` ${children} `}</Text>;
}

function ExamRow({ exam: e, teacherId, first, sub }: { exam: ScheduledExam; teacherId: string | null; first: boolean; sub?: boolean }) {
  const r = examRoles(e, teacherId);
  const proctors = e.proctors.filter((p) => !p.onLeave);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: first ? 0 : 1, borderTopColor: colors.divider }}>
      <View style={{ width: 58 }}>
        <T size={13.5} weight="800">
          {e.periodNo}. ders
        </T>
        <T size={11.5} color={colors.faint}>
          {e.start ?? '—'}
        </T>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        {/* Başlıkta ders adı; sınıf adı altında (şube satırında yalnızca sınıf) */}
        <T size={14.5} weight="800" lines={2}>
          {sub ? labelOf(e) : e.subject}
        </T>
        {!sub && (
          <T size={12.5} color={colors.muted}>
            {labelOf(e)}
          </T>
        )}
        {/* Gözetmenler alt alta; her satır "Gözetmen:" ile başlar, adlar aynı hizada */}
        {proctors.length ? (
          proctors.map((p) => (
            <T key={p.teacherId} size={12.5} color={colors.muted}>
              Gözetmen: {p.teacherId === teacherId ? <Me>{`${p.fullName} (siz)`}</Me> : p.fullName}
            </T>
          ))
        ) : (
          <T size={12.5} color={colors.muted}>
            Gözetmen belirlenmedi
          </T>
        )}
        {(r.subject || e.note) && (
          <T size={12.5} color={colors.muted}>
            {r.subject && !r.proctor && <Me>Dersinizin sınavı</Me>}
            {r.subject && r.proctor ? 'Dersiniz' : ''}
            {r.subject && e.note ? ' · ' : ''}
            {e.note ?? ''}
          </T>
        )}
      </View>
      {e.warnings.length > 0 && <Icon name="warning-outline" size={16} color={colors.warning} />}
    </View>
  );
}
