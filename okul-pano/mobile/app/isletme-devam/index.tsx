import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useInternshipAccess, useSchoolQuery } from '../../src/data.ts';
import {
  addDays,
  fmtDays,
  isoWeekday,
  monthName,
  pickable,
  prevCode,
  ReportSheet,
  SendSheet,
  shortDate,
  TONE,
  UndoBar,
  useMarks,
  useScopeView,
  type Cell,
  type Code,
  type Half,
  type PendingMark,
  type SheetData,
  type SheetStudent,
} from '../../src/intern.tsx';
import { Sheet } from '../../src/sheet.tsx';
import { Text } from '../../src/text.tsx';
import { colors, radius } from '../../src/theme.ts';
import { Button, Empty, ErrorNote, Icon, Loading, Screen, Segmented, T } from '../../src/ui.tsx';

/*
 * İşletmede devam · gün gün işaretleme (mobil): üstte haftanın beş günü (nokta: yeşil tamam, turuncu eksik, gri
 * bekliyor), altta seçili günün öğrencileri işletmelere göre gruplu; her öğrencide sabah ve öğleden sonra için büyük kod
 * düğmeleri. Dokununca hemen kaydedilir ve "Geri al" çıkar; seçili koda yeniden dokunmak işareti kaldırır (Geri al ile).
 * X "İşletmede" de koordinatörün koyduğu işarettir; işaretsiz geçmiş gün "?" kalır. Ayın tamamı "Aylık çizelge"de.
 */

const WD = ['', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
const CODES: Code[] = ['X', 'D', 'İ', 'R', 'H'];
const CODE_TEXT: Record<Code, string> = { '-': 'işaret kaldırıldı', X: 'işletmede', D: 'özürsüz devamsız', İ: 'izinli', R: 'raporlu', H: 'hasta sevkli', T: 'tatil', K: 'işletme kapalı' };
const HALF_TEXT: Record<Half, string> = { am: 'Sabah', pm: 'Öğleden sonra' };
const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
const localToday = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
/** Hafta sonu açılırsa önceki cuma */
const workday = (iso: string) => {
  const w = isoWeekday(iso);
  return w >= 6 ? addDays(iso, 5 - w) : iso;
};

type DayState = 'done' | 'missing' | 'future' | 'none';

export default function IsletmeDevam() {
  const p = useLocalSearchParams<{ tarih?: string; ay?: string }>();
  const [date, setDate] = useState(() => workday(isDate(p.tarih) ? p.tarih! : p.ay && /^\d{4}-\d{2}$/.test(p.ay) ? `${p.ay}-01` : localToday()));
  // Aylık çizelgeden bir güne dokunulunca o gün açılır
  useEffect(() => {
    if (isDate(p.tarih)) setDate(workday(p.tarih!));
  }, [p.tarih]);
  const month = date.slice(0, 7);
  const sheet = useSchoolQuery<SheetData>(`internship/sheet?month=${month}`);
  const d = sheet.data?.month === month ? sheet.data : undefined;
  const marks = useMarks();
  const pending = useSchoolQuery<PendingMark[]>('internship/pending');
  const access = useInternshipAccess();
  const scope = useScopeView(d, access.data);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState<SheetStudent | null>(null);
  const [bizMenu, setBizMenu] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(() => (d?.students ?? []).filter(scope.visible), [d, scope.visible]);
  const today = d?.today ?? localToday();
  const di = d ? d.days.findIndex((x) => x.date === date) : -1;
  const day = di >= 0 ? d!.days[di] : undefined;
  const future = date > today;
  const monday = addDays(date, 1 - isoWeekday(date));
  const week = [0, 1, 2, 3, 4].map((n) => addDays(monday, n));

  const stateOf = (iso: string): DayState => {
    if (!d || iso.slice(0, 7) !== d.month) return 'none';
    const i = d.days.findIndex((x) => x.date === iso);
    const halves = rows.filter((s) => s.editable).flatMap((s) => s.cells[i] ?? []).filter((c) => pickable(c));
    if (!halves.length) return 'none';
    if (iso > today) return 'future';
    return halves.some((c) => c === '?' || c === '') ? 'missing' : 'done';
  };
  const DOT: Record<DayState, string | null> = { done: colors.success, missing: colors.warning, future: colors.border, none: null };

  // Seçili günün öğrencileri işletmelere göre: kendi işletmeleri önce
  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; mine: boolean; list: SheetStudent[] }>();
    for (const s of rows) {
      const g = m.get(s.businessId) ?? { id: s.businessId, name: s.businessName, mine: Boolean(s.mine), list: [] };
      g.list.push(s);
      m.set(s.businessId, g);
    }
    return [...m.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name, 'tr'));
  }, [rows]);

  const setHalves = (items: { s: SheetStudent; half: Half; code: Code }[], label: string) => {
    if (!items.length || di < 0) return;
    setNotice(null);
    void marks.save(
      { date, items: items.map((x) => ({ studentId: x.s.id, half: x.half, code: x.code })) },
      { label, body: { date, items: items.map((x) => ({ studentId: x.s.id, half: x.half, code: prevCode(x.s.cells[di]![x.half === 'am' ? 0 : 1]!) })) } },
    );
  };

  const tapCode = (s: SheetStudent, half: Half, code: Code) => {
    const cur = s.cells[di]![half === 'am' ? 0 : 1]!;
    const clear = cur === code;
    setHalves([{ s, half, code: clear ? '-' : code }], `${s.fullName}: ${shortDate(date)} ${HALF_TEXT[half].toLocaleLowerCase('tr-TR')} · ${CODE_TEXT[clear ? '-' : code]}`);
  };

  const fillBusiness = (list: SheetStudent[], code: Code, onlyEmpty: boolean, name: string) => {
    const items = list
      .filter((s) => s.editable)
      .flatMap((s) =>
        (['am', 'pm'] as Half[])
          .filter((h, i) => {
            const c = s.cells[di]![i]!;
            return pickable(c) && (!onlyEmpty || c === '?' || c === '');
          })
          .map((half) => ({ s, half, code })),
      );
    setHalves(items, `${name}: ${shortDate(date)} · ${CODE_TEXT[code]}`);
  };

  const pendingDays = (pending.data?.length ?? 0) / 2;

  const footer = (
    <View style={{ gap: 8 }}>
      {marks.undo && <UndoBar label={marks.undo.label} onUndo={marks.undoLast} />}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" icon="calendar-outline" style={{ flex: 1 }} onPress={() => router.push(`/isletme-devam/aylik?ay=${month}`)}>
          Aylık çizelge
        </Button>
        <Button style={{ flex: 1 }} disabled={!pendingDays} onPress={() => setSending(true)}>
          {pendingDays ? `Gönder · ${fmtDays(pendingDays)} gün` : 'Gönder'}
        </Button>
      </View>
    </View>
  );

  return (
    <Screen title="İşletmede Devam" subtitle={`${monthName(month)} · ${shortDate(date)} ${['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][isoWeekday(date)]}`} back refreshing={sheet.isRefetching} onRefresh={() => void sheet.refetch()} footer={footer}>
      {/* Hafta: önceki / sonraki hafta oklarıyla */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Önceki hafta" hitSlop={8} onPress={() => setDate(addDays(date, -7))} style={{ padding: 4 }}>
          <Icon name="chevron-back" size={20} color={colors.muted} />
        </Pressable>
        {week.map((iso) => {
          const on = iso === date;
          const dot = DOT[stateOf(iso)];
          return (
            <Pressable
              key={iso}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${shortDate(iso)}${stateOf(iso) === 'missing' ? ', eksik var' : stateOf(iso) === 'done' ? ', tamam' : ''}`}
              onPress={() => setDate(iso)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: on ? colors.ink : colors.border, backgroundColor: on ? colors.ink : colors.card }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: on ? colors.bg : colors.muted }}>{WD[isoWeekday(iso)]}</Text>
              <Text style={{ fontSize: 17, fontWeight: '800', color: on ? colors.bg : colors.ink }}>{Number(iso.slice(8))}</Text>
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 2, backgroundColor: dot ?? 'transparent' }} />
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Sonraki hafta" hitSlop={8} onPress={() => setDate(addDays(date, 7))} style={{ padding: 4 }}>
          <Icon name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      </View>
      {date !== workday(today) && (
        <Pressable accessibilityRole="button" onPress={() => setDate(workday(today))} style={{ alignSelf: 'center' }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.info }}>Bugüne dön</Text>
        </Pressable>
      )}
      {scope.options && <Segmented<'mine' | 'all'> value={scope.value} onChange={scope.setView} options={scope.options} />}
      <ErrorNote error={sheet.error} />
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
      {!d ? (
        <Loading />
      ) : !d.students.length ? (
        <Empty icon="business-outline" title="Öğrenci yok" text="İşletmeye bağlı öğrenci yok." />
      ) : day?.holiday ? (
        <Empty icon="sunny-outline" title="Resmî tatil" text={day.holiday} />
      ) : (
        groups.map((g) => {
          const editable = g.list.some((s) => s.editable);
          const empty = !future && g.list.some((s) => s.editable && s.cells[di]!.some((c) => c === '?'));
          return (
            <View key={g.id} style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14.5, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: colors.faint }}>{g.list.length} öğrenci</Text>
                </View>
                {empty && (
                  <Button size="sm" variant="secondary" icon="checkmark-done" onPress={() => fillBusiness(g.list, 'X', true, g.name)}>
                    Hepsi işletmede
                  </Button>
                )}
                {editable && (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${g.name} diğer işlemler`} hitSlop={8} onPress={() => setBizMenu({ id: g.id, name: g.name })} style={{ padding: 6 }}>
                    <Icon name="dots" size={20} color={colors.muted} />
                  </Pressable>
                )}
              </View>
              {g.list.map((s) => (
                <StudentDay key={s.id} s={s} cells={s.cells[di]!} date={date} future={future} busy={marks.busy} onCode={(half, code) => tapCode(s, half, code)} onMore={() => setReport(s)} />
              ))}
            </View>
          );
        })
      )}
      {d && rows.length > 0 && (
        <T size={12} color={colors.faint}>
          Koda dokununca hemen kaydedilir; seçili koda yeniden dokunmak işareti kaldırır. Devamsızlık, siz “Gönder” deyince müdür yardımcısına gider (turuncu nokta: henüz gönderilmedi).
        </T>
      )}
      {bizMenu && d && (
        <Sheet open onClose={() => setBizMenu(null)}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{bizMenu.name}</Text>
          <T size={12.5} color={colors.faint} style={{ marginTop: 4 }}>
            {shortDate(date)} · bütün öğrencilere uygulanır; konan işaretlerin yerine geçer. “Geri al” ile dönülür.
          </T>
          <View style={{ gap: 8, marginTop: 12 }}>
            {(
              [
                ['K', 'İşletme kapalı (K)'],
                ['T', 'Tatil (T)'],
              ] as const
            ).map(([code, label]) => (
              <Button
                key={code}
                variant="secondary"
                onPress={() => {
                  fillBusiness(groups.find((x) => x.id === bizMenu.id)?.list ?? [], code, false, bizMenu.name);
                  setBizMenu(null);
                }}
              >
                {label}
              </Button>
            ))}
          </View>
        </Sheet>
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
      {report && (
        <ReportSheet
          student={report}
          from={date}
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

/** Bir öğrencinin günü: sabah ve öğleden sonra için kod düğmeleri */
function StudentDay({ s, cells, date, future, busy, onCode, onMore }: { s: SheetStudent; cells: [Cell, Cell]; date: string; future: boolean; busy: boolean; onCode: (half: Half, code: Code) => void; onMore: () => void }) {
  return (
    <View style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${s.fullName} öğrenci sayfası`} onPress={() => router.push(`/stajyer/${s.id}`)} style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
            {s.fullName}
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.faint }}> · {s.className ?? s.schoolNo}</Text>
          </Text>
        </Pressable>
        {s.editable && (
          <Pressable accessibilityRole="button" onPress={onMore} hitSlop={8}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.info }}>Birkaç gün…</Text>
          </Pressable>
        )}
      </View>
      {(['am', 'pm'] as Half[]).map((half, i) => {
        const c = cells[i]!;
        const fixed = c === 'O' ? 'Okulda' : c === 'TA' ? 'Resmî tatil' : c === 'W' ? 'Hafta sonu' : null;
        const unsent = s.unsent?.includes(`${date}|${half}`);
        return (
          <View key={half} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ width: 54, fontSize: 11, lineHeight: 13, fontWeight: '700', color: colors.muted }}>{HALF_TEXT[half]}</Text>
            {fixed ? (
              <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.faint, paddingVertical: 9 }}>{fixed}</Text>
            ) : (
              <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>
                {[...CODES, ...(c === 'K' || c === 'T' ? [c as Code] : [])].map((code) => {
                  const on = c === code;
                  const t = TONE[code]!;
                  const off = !s.editable || (future && (code === 'X' || code === 'D'));
                  return (
                    <Pressable
                      key={code}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, disabled: off }}
                      accessibilityLabel={`${s.fullName} ${HALF_TEXT[half]} ${code} ${CODE_TEXT[code]}${on ? ', seçili' : ''}`}
                      disabled={off || busy}
                      onPress={() => onCode(half, code)}
                      style={{
                        flex: 1,
                        height: 38,
                        borderRadius: 11,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? t.bg : colors.primarySoft,
                        borderWidth: on ? 2 : 0,
                        borderColor: on ? (code === 'X' ? colors.ink : (t.border ?? t.fg)) : 'transparent',
                        opacity: off && !on ? 0.35 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '800', color: on ? t.fg : colors.muted }}>{code}</Text>
                      {on && unsent && <View style={{ position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: '#f59e0b', borderWidth: 1.5, borderColor: colors.card }} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
