import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSchoolQuery } from '../src/data.ts';
import { HALF_SHORT, HALVES, LegendBand, letter, pickable, prevCode, ReportSheet, shortDate, TONE, UndoBar, useMarks, type Cell, type Code, type Half } from '../src/intern.tsx';
import { Text } from '../src/text.tsx';
import { colors, radius } from '../src/theme.ts';
import { Button, Chip, Empty, ErrorNote, Loading, Screen, T } from '../src/ui.tsx';

/*
 * İşletmede devam (aylık çizelge, webdeki sayfanın mobil hâli): ad sütunu sabit, günler yana kayar; her gün S (sabah) ve
 * Ö (öğle) iki hücre. Hücreye dokununca seçilir, alttaki rozetlerden biri seçilince o alan hemen işaretlenip kaydedilir.
 */

interface SheetStudent {
  id: string;
  fullName: string;
  schoolNo: string;
  classId: string | null;
  className: string | null;
  businessId: string;
  businessName: string;
  editable: boolean;
  cells: [Cell, Cell][];
  totals: { excused: number; unexcused: number };
}
interface SheetData {
  month: string;
  today: string;
  days: { date: string; weekday: number; holiday: string | null; halfDay: string | null }[];
  classes: { id: string; name: string }[];
  businesses: { id: string; name: string }[];
  managerAssigned: boolean;
  students: SheetStudent[];
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WD = ['', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
const shiftMonth = (m: string, n: number) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

const NAME_W = 146;
const CELL_W = 28;
const CELL_H = 22;
const ROW_H = CELL_H * 2 + 10;
const HEAD_H = 38;

const PALETTE: { code: Code; label: string }[] = [
  { code: 'X', label: 'X' },
  { code: 'D', label: 'D' },
  { code: 'İ', label: 'İ' },
  { code: 'R', label: 'R' },
  { code: 'H', label: 'H' },
  { code: 'K', label: 'K' },
  { code: 'T', label: 'T' },
];
const CODE_TEXT: Record<Code, string> = { X: 'işaret silindi', D: 'özürsüz devamsız', İ: 'izinli', R: 'raporlu', H: 'hasta sevkli', T: 'tatil', K: 'işletme kapalı' };

interface Sel {
  studentId: string;
  di: number;
  half: Half;
}

export default function IsletmeDevam() {
  const { ay } = useLocalSearchParams<{ ay?: string }>();
  const [month, setMonth] = useState<string | null>(ay && /^\d{4}-\d{2}$/.test(ay) ? ay : null);
  const sheet = useSchoolQuery<SheetData>(`internship/sheet${month ? `?month=${month}` : ''}`);
  const d = sheet.data;
  const marks = useMarks();
  const [classId, setClassId] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [sel, setSel] = useState<Sel | null>(null);
  const [scope, setScope] = useState<'half' | 'day'>('half');
  const [report, setReport] = useState<SheetStudent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    setSel(null);
  }, [d?.month]);

  const rows = useMemo(() => (d?.students ?? []).filter((s) => (!classId || s.classId === classId) && (!businessId || s.businessId === businessId)), [d, classId, businessId]);
  const m = d?.month ?? month;
  const student = sel ? d?.students.find((s) => s.id === sel.studentId) : undefined;
  const selDay = sel && d ? d.days[sel.di] : undefined;
  const future = Boolean(selDay && d && selDay.date > d.today);

  const apply = (code: Code) => {
    if (!sel || !student || !selDay) return;
    const cells = student.cells[sel.di]!;
    const halves: Half[] = scope === 'day' ? HALVES.filter((h, i) => pickable(cells[i]!)) : [sel.half];
    if (!halves.length) return;
    const when = `${shortDate(selDay.date)} ${halves.length === 2 ? 'tam gün' : sel.half === 'am' ? 'sabah' : 'öğle'}`;
    void marks.save(
      { date: selDay.date, items: halves.map((half) => ({ studentId: student.id, half, code })) },
      {
        label: `${student.fullName}: ${when} · ${CODE_TEXT[code]}`,
        body: { date: selDay.date, items: halves.map((half) => ({ studentId: student.id, half, code: prevCode(cells[half === 'am' ? 0 : 1]!) })) },
      },
    );
  };

  const footer = sel && student && selDay ? (
    <View style={{ gap: 8 }}>
      {marks.undo && <UndoBar label={marks.undo.label} onUndo={marks.undoLast} />}
      <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
            {student.fullName} · {shortDate(selDay.date)}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setSel(null)} hitSlop={10}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.faint }}>Kapat</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['am', 'pm', 'day'] as const).map((v) => {
            const on = v === 'day' ? scope === 'day' : scope === 'half' && sel.half === v;
            const ok = v === 'day' || pickable(student.cells[sel.di]![v === 'am' ? 0 : 1]!);
            return (
              <Pressable
                key={v}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: !ok }}
                disabled={!ok}
                onPress={() => {
                  if (v === 'day') setScope('day');
                  else {
                    setScope('half');
                    setSel({ ...sel, half: v });
                  }
                }}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999, backgroundColor: on ? colors.ink : colors.primarySoft, opacity: ok ? 1 : 0.4 }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: on ? colors.bg : colors.muted }}>{v === 'am' ? 'S · Sabah' : v === 'pm' ? 'Ö · Öğle' : 'Tam gün'}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {PALETTE.filter((p) => !(future && p.code === 'D')).map((p) => {
            const t = TONE[p.code]!;
            return (
              <Pressable
                key={p.code}
                accessibilityRole="button"
                accessibilityLabel={`${p.code} ${CODE_TEXT[p.code]}`}
                disabled={marks.busy}
                onPress={() => apply(p.code)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: t.bg, borderWidth: 1, borderColor: t.border ?? t.bg }}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: t.fg }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setReport(student)} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.info }}>+ Birkaç günlük rapor / izin</Text>
        </Pressable>
      </View>
    </View>
  ) : marks.undo ? (
    <UndoBar label={marks.undo.label} onUndo={marks.undoLast} />
  ) : undefined;

  return (
    <Screen title="İşletmede Devam" subtitle={m ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : undefined} back refreshing={sheet.isRefetching} onRefresh={() => void sheet.refetch()} footer={footer}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" size="sm" icon="chevron-back" onPress={() => m && setMonth(shiftMonth(m, -1))}>
          Önceki ay
        </Button>
        <View style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onPress={() => m && setMonth(shiftMonth(m, 1))}>
          Sonraki ay
        </Button>
      </View>
      <LegendBand />
      <ErrorNote error={sheet.error} />
      {!d ? (
        <Loading />
      ) : !d.students.length ? (
        <Empty icon="business-outline" title="Öğrenci yok" text="İşletmeye bağlı öğrenci yok. İşletmeler yönetim panelinden eklenir." />
      ) : (
        <>
          {(d.classes.length > 1 || d.businesses.length > 1) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
              {d.classes.length > 1 && <Chip label="Bütün sınıflar" selected={!classId} onPress={() => setClassId('')} />}
              {d.classes.length > 1 && d.classes.map((c) => <Chip key={c.id} label={c.name} selected={classId === c.id} onPress={() => setClassId(c.id)} />)}
              {d.businesses.length > 1 && <Chip label="Bütün işletmeler" selected={!businessId} onPress={() => setBusinessId('')} />}
              {d.businesses.length > 1 && d.businesses.map((b) => <Chip key={b.id} label={b.name} selected={businessId === b.id} onPress={() => setBusinessId(b.id)} />)}
            </ScrollView>
          )}
          <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {/* Sabit ad sütunu */}
            <View style={{ width: NAME_W, borderRightWidth: 1, borderRightColor: colors.border }}>
              <View style={{ height: HEAD_H, justifyContent: 'center', paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.faint }}>No · Sınıf · Ad</Text>
              </View>
              {rows.map((s) => (
                <View key={s.id} style={{ height: ROW_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, borderTopWidth: 1, borderTopColor: colors.divider }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.faint }} numberOfLines={1}>
                      {s.schoolNo} · {s.className ?? ''}
                    </Text>
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
                      {s.fullName}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.subtle }} numberOfLines={1}>
                      {s.businessName}
                    </Text>
                  </View>
                  <View style={{ width: 16, gap: 4 }}>
                    {HALVES.map((h) => (
                      <Text key={h} style={{ fontSize: 10, fontWeight: '800', color: colors.faint, height: CELL_H, lineHeight: CELL_H, textAlign: 'center' }}>
                        {HALF_SHORT[h]}
                      </Text>
                    ))}
                  </View>
                </View>
              ))}
            </View>
            {/* Günler yana kayar */}
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={{ flexDirection: 'row', height: HEAD_H, alignItems: 'center' }}>
                  {d.days.map((day) => (
                    <View key={day.date} style={{ width: CELL_W + 2, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: day.weekday >= 6 ? colors.subtle : colors.ink }}>{Number(day.date.slice(8))}</Text>
                      <Text style={{ fontSize: 9.5, color: colors.faint }}>{WD[day.weekday]}</Text>
                    </View>
                  ))}
                  <View style={{ width: 56, alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.faint, textAlign: 'center' }}>ÖZÜR{'\n'}LÜ</Text>
                  </View>
                  <View style={{ width: 56, alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.faint, textAlign: 'center' }}>ÖZÜR{'\n'}SÜZ</Text>
                  </View>
                </View>
                {rows.map((s) => (
                  <View key={s.id} style={{ flexDirection: 'row', height: ROW_H, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.divider }}>
                    {d.days.map((day, di) => (
                      <View key={day.date} style={{ width: CELL_W + 2, alignItems: 'center', gap: 4 }}>
                        {s.cells[di]!.map((c, hi) => {
                          const half: Half = hi ? 'pm' : 'am';
                          const can = s.editable && pickable(c);
                          const on = sel?.studentId === s.id && sel.di === di && (scope === 'day' || sel.half === half);
                          const t = TONE[c] ?? TONE['']!;
                          return (
                            <Pressable
                              key={half}
                              disabled={!can}
                              accessibilityLabel={`${s.fullName} ${Number(day.date.slice(8))} ${half === 'am' ? 'sabah' : 'öğle'} ${letter(c) || 'boş'}`}
                              onPress={() => {
                                setSel({ studentId: s.id, di, half });
                                setScope('half');
                              }}
                              style={{
                                width: CELL_W,
                                height: CELL_H,
                                borderRadius: 5,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: t.bg,
                                borderWidth: on ? 2 : t.border ? 1 : 0,
                                borderColor: on ? colors.ink : t.border,
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '800', color: t.fg }}>{letter(c)}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                    <Text style={{ width: 56, textAlign: 'center', fontSize: 13, fontWeight: '800', color: '#6d28d9' }}>{s.totals.excused ? fmt(s.totals.excused) : '–'}</Text>
                    <Text style={{ width: 56, textAlign: 'center', fontSize: 13, fontWeight: '800', color: colors.danger }}>{s.totals.unexcused ? fmt(s.totals.unexcused) : '–'}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
          <T size={12} color={colors.faint}>
            Hücreye dokunun, alttaki rozetten işareti seçin; hemen kaydedilir. Devamsızlık birkaç dakika sonra müdür yardımcısına bildirilir.
          </T>
          {marks.error && (
            <T size={13} color={colors.danger}>
              {marks.error}
            </T>
          )}
          {notice && (
            <T size={13} color={colors.success} weight="700">
              {notice}
            </T>
          )}
        </>
      )}
      {report && selDay && (
        <ReportSheet
          student={report}
          from={selDay.date}
          onClose={() => setReport(null)}
          onSaved={(msg) => {
            setReport(null);
            setNotice(msg);
            void sheet.refetch();
          }}
        />
      )}
    </Screen>
  );
}
