import { EXAM_KINDS, examGroupClasses, examGroupPeriods, examRoles, groupExams, type ExamGroup, type ExamKind, type ScheduledExam } from '@okulpano/shared/examCore';
import { compareClassNames } from '@okulpano/shared/grade';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useExamSchedule, useMeToday } from '../src/data.ts';
import { dayTitle, localIso } from '../src/day.ts';
import { colors, tiles, type TileTone } from '../src/theme.ts';
import { Text } from '../src/text.tsx';
import { Card, Chip, Empty, ErrorNote, Icon, Loading, Screen, Segmented, T } from '../src/ui.tsx';

/*
 * Sınav takvimi: gün şeridi (sınavı olan günlerde nokta) ve "Benim / Tüm okul / Sınıf" süzgeci. Saat, o sınıfın
 * zilinden hesaplanmış gelir. Öğretmenin rolü (gözetmen / dersin öğretmeni) satırda yazar.
 */

type Filter = 'mine' | 'all' | 'class';
const KIND_TONE: Record<ExamKind, TileTone> = { written: 'lilac', common: 'sky', practical: 'sun' };
const DAY = 86400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const SHORT = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function KindPill({ kind }: { kind: ExamKind }) {
  const t = tiles[KIND_TONE[kind]];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
      <T size={11.5} weight="800" color={t.fg}>
        {EXAM_KINDS[kind]}
      </T>
    </View>
  );
}

export default function SinavTakvimi() {
  const q = useExamSchedule();
  const me = useMeToday();
  const teacherId = me.data?.teacher?.id ?? null;
  const [filter, setFilter] = useState<Filter | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const active: Filter = filter ?? (teacherId ? 'mine' : 'all');

  const today = q.data?.today ?? localIso();
  const all = q.data?.exams ?? [];
  const classes = useMemo(() => [...new Map(all.map((e) => [e.classGroupId, e.className])).entries()].sort((a, b) => compareClassNames(a[1], b[1])), [all]);
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

  return (
    <Screen back title="Sınav takvimi" subtitle="Yazılı, uygulama ve ortak sınavlar" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <ErrorNote error={q.error} />
      {q.isLoading ? (
        <Loading />
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
  const [open, setOpen] = useState(false);
  const e = g.items[0]!;
  const mine = g.items.filter((x) => {
    const r = examRoles(x, teacherId);
    return r.proctor || r.subject;
  });
  const starts = [...new Set(g.items.map((x) => x.start ?? '—'))];
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: colors.divider }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 58 }}>
          <T size={13.5} weight="800">
            {g.samePeriod ? `${e.periodNo}. ders` : 'Şubeye göre'}
          </T>
          <T size={11.5} color={colors.faint}>
            {g.samePeriod ? (starts.length === 1 ? starts[0] : 'şubeye göre') : examGroupPeriods(g)}
          </T>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={14.5} weight="800" lines={2}>
            {e.subject}
          </T>
          <T size={12.5} color={colors.muted} lines={2}>
            {mine.length > 0 && <Me>{`Sizin: ${mine.map((x) => x.className).join(', ')}`}</Me>}
            {mine.length > 0 ? ' · ' : ''}
            {examGroupClasses(g, 8)}
          </T>
        </View>
        <KindPill kind={e.kind} />
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
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={14.5} weight="800" lines={2}>
          {sub ? e.className : `${e.className} · ${e.subject}`}
        </T>
        <T size={12.5} color={colors.muted} lines={3}>
          {proctors.length ? 'Gözetmen: ' : 'Gözetmen belirlenmedi'}
          {proctors.map((p, i) => (
            <Text key={p.teacherId}>
              {i > 0 ? ', ' : ''}
              {p.teacherId === teacherId ? <Me>{`${p.fullName} (siz)`}</Me> : p.fullName}
            </Text>
          ))}
          {r.subject && !r.proctor ? ' · ' : ''}
          {r.subject && !r.proctor && <Me>Dersinizin sınavı</Me>}
          {r.subject && r.proctor ? ' · dersiniz' : ''}
          {e.note ? ` · ${e.note}` : ''}
        </T>
      </View>
      {!sub && <KindPill kind={e.kind} />}
      {e.warnings.length > 0 && <Icon name="warning-outline" size={16} color={colors.warning} />}
    </View>
  );
}
