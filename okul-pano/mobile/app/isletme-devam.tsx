import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSchoolQuery } from '../src/data.ts';
import { FillSheet, HALF_SHORT, HALVES, LegendBand, letter, PendingStrip, pickable, prevCode, ReportSheet, SendSheet, shortDate, TONE, UndoBar, useMarks, type Cell, type Code, type Half, type PendingMark } from '../src/intern.tsx';
import { Text } from '../src/text.tsx';
import { colors, radius } from '../src/theme.ts';
import { Button, Chip, Empty, ErrorNote, Icon, Loading, Screen, T } from '../src/ui.tsx';

/*
 * İşletmede devam (aylık çizelge, webdeki sayfanın mobil hâli): ad sütunu sabit, günler yana kayar; her gün S (sabah) ve
 * Ö (öğle) iki hücre. Hücreye dokununca seçilir, alttaki rozetlerden biri seçilince o alan hemen işaretlenip kaydedilir;
 * yanlış işaret "Sil" ile kaldırılır. X "İşletmede" de koordinatörün koyduğu işarettir; işaretsiz geçmiş gün "?".
 * Devamsızlıklar turuncu noktalı (gönderilmedi) kalır; altta "Gönder…" ile müdür yardımcısına gider.
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
  unsent?: string[];
  totals: { excused: number; unexcused: number; unchecked?: number };
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
const CODE_TEXT: Record<Code, string> = { '-': 'işaret silindi', X: 'işletmede', D: 'özürsüz devamsız', İ: 'izinli', R: 'raporlu', H: 'hasta sevkli', T: 'tatil', K: 'işletme kapalı' };

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
  const pending = useSchoolQuery<PendingMark[]>('internship/pending');
  const [filling, setFilling] = useState(false);
  const [sending, setSending] = useState(false);
  const [classId, setClassId] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [sel, setSel] = useState<Sel | null>(null);
  const [scope, setScope] = useState<'half' | 'day'>('half');
  const [report, setReport] = useState<SheetStudent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Gün sütunları: açılışta (ve ay değişince) bu haftanın pazartesisine kaydırılır; kullanıcı kaydırınca dokunulmaz
  const daysRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrolledFor = useRef<string | null>(null);
  const scrollToWeek = () => {
    const days = sheet.data?.days;
    if (!days?.length || !daysRef.current || scrolledFor.current === sheet.data!.month) return;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const ti = days.findIndex((x) => x.date === today);
    // Bu ay değilse ayın başı
    const idx = ti < 0 ? 0 : Math.max(0, ti - ((days[ti]!.weekday + 6) % 7));
    scrolledFor.current = sheet.data!.month;
    daysRef.current.scrollTo({ x: idx * (CELL_W + 2), animated: false });
  };
  useEffect(() => {
    setSel(null);
  }, [d?.month]);

  const rows = useMemo(() => (d?.students ?? []).filter((s) => (!classId || s.classId === classId) && (!businessId || s.businessId === businessId)), [d, classId, businessId]);
  const m = d?.month ?? month;
  const student = sel ? d?.students.find((s) => s.id === sel.studentId) : undefined;
  const selDay = sel && d ? d.days[sel.di] : undefined;
  const future = Boolean(selDay && d && selDay.date > d.today);
  // Seçili alanda silinecek bir işaret var mı (D, İ, R, H, K, T)
  const marked = Boolean(
    sel && student && (scope === 'day' ? student.cells[sel.di]! : [student.cells[sel.di]![sel.half === 'am' ? 0 : 1]!]).some((c) => prevCode(c) !== '-'),
  );

  const apply = (code: Code, clear = false) => {
    if (!sel || !student || !selDay) return;
    const cells = student.cells[sel.di]!;
    const halves: Half[] = scope === 'day' ? HALVES.filter((h, i) => pickable(cells[i]!)) : [sel.half];
    if (!halves.length) return;
    const when = `${shortDate(selDay.date)} ${halves.length === 2 ? 'tam gün' : sel.half === 'am' ? 'sabah' : 'öğle'}`;
    void marks.save(
      { date: selDay.date, items: halves.map((half) => ({ studentId: student.id, half, code })) },
      {
        label: `${student.fullName}: ${when} · ${clear ? 'işaret silindi' : CODE_TEXT[code]}`,
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
          {PALETTE.filter((p) => !(future && (p.code === 'D' || p.code === 'X'))).map((p) => {
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable accessibilityRole="button" onPress={() => setReport(student)} style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.info }}>+ Birkaç günlük rapor / izin</Text>
          </Pressable>
          {/* Yanlış işareti kaldırmak: "İşletmede" (X) rozetinden ayrı, açıkça "Sil" */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="İşareti sil"
            disabled={marks.busy || !marked}
            onPress={() => apply('-', true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft, opacity: marked ? 1 : 0.4 }}
          >
            <Icon name="trash-outline" size={15} color={colors.danger} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.danger }}>Sil</Text>
          </Pressable>
        </View>
      </View>
    </View>
  ) : marks.undo || pending.data?.length ? (
    <View style={{ gap: 8 }}>
      {marks.undo && <UndoBar label={marks.undo.label} onUndo={marks.undoLast} />}
      {Boolean(pending.data?.length) && <PendingStrip rows={pending.data!} onPress={() => setSending(true)} />}
    </View>
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
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.faint }}>Öğrenci</Text>
              </View>
              {rows.map((s) => (
                <View key={s.id} style={{ height: ROW_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, borderTopWidth: 1, borderTopColor: colors.divider }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
                      {s.fullName}
                    </Text>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.faint }} numberOfLines={1}>
                      {s.schoolNo} · {s.className ?? ''}
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
            {/* Günler yana kayar; açılınca içinde bulunulan haftanın pazartesisi başta görünür */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              ref={daysRef}
              onLayout={() => scrollToWeek()}
              onContentSizeChange={() => scrollToWeek()}
            >
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
                          const unsent = s.unsent?.includes(`${day.date}|${half}`);
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
                                borderStyle: t.dashed && !on ? 'dashed' : 'solid',
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '800', color: t.fg }}>{letter(c)}</Text>
                              {unsent && (
                                <View style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b', borderWidth: 1.5, borderColor: '#fff' }} />
                              )}
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
            Hücreye dokunun, alttaki rozetten işareti seçin; hemen kaydedilir. “?” kontrol edilmedi demektir. Devamsızlık, siz “Gönder” deyince müdür yardımcısına gider (turuncu nokta: henüz gönderilmedi).
          </T>
          {rows.some((s) => s.editable) && (
            <Button variant="secondary" icon="checkmark-done" onPress={() => setFilling(true)}>
              İşaretsiz (?) günleri İşletmede yap…
            </Button>
          )}
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
      {filling && d && (
        <FillSheet
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
