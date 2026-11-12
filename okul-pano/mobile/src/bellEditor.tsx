import { bellScheduleSchema, compareClassNames, generatePeriods, shiftPeriods, sortPeriods, validatePeriods, WEEKDAY_SHORT, type Period, type Shift } from '@okulpano/shared';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Sheet, SheetScroll } from './sheet.tsx';
import { centeredText, Text } from './text.tsx';
import { colors } from './theme.ts';
import { Button, Chip, Field, Icon, T } from './ui.tsx';

/** Zil düzeni (web ile aynı kayıt) */
export interface BellScheduleRow {
  id: string;
  name: string;
  periods: Period[];
  lessonCount: number | null;
  weekdays: number[];
  shift: Shift | null;
  sortOrder?: number;
  classIds: string[] | null;
}

export interface ClassRow {
  id: string;
  name: string;
  shift?: Shift | null;
  bellExempt?: boolean | null;
}

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const fmt = (m: number) => {
  const t = Math.min(23 * 60 + 59, Math.max(0, m));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
export const addMin = (hm: string, d: number) => fmt(toMin(hm) + d);
export const gapMin = (a: Period, b: Period) => toMin(b.start) - toMin(a.end);

/** Kural (ilk ders, ders süresi, teneffüsler, öğle arası) saatlerden çıkarılır (web ile aynı) */
export interface Rule {
  firstStart: string;
  lessonMin: number;
  breakMin: number;
  count: number;
  lunchAfter: number;
  lunchMin: number;
  afternoonBreakMin: number | null;
}
export const DEFAULT_RULE: Rule = { firstStart: '08:30', lessonMin: 40, breakMin: 10, count: 8, lunchAfter: 5, lunchMin: 45, afternoonBreakMin: null };
export function deriveRule(periods: readonly Period[]): Rule {
  const ps = sortPeriods(periods);
  const first = ps[0];
  if (!first) return DEFAULT_RULE;
  const gaps = ps.slice(1).map((p, i) => gapMin(ps[i]!, p));
  const longest = Math.max(0, ...gaps);
  const lunchIdx = longest >= 20 ? gaps.indexOf(longest) : -1;
  const before = gaps.filter((_, i) => lunchIdx < 0 || i < lunchIdx);
  const after = lunchIdx < 0 ? [] : gaps.filter((_, i) => i > lunchIdx);
  const breakMin = before[0] ?? 10;
  return {
    firstStart: first.start,
    lessonMin: toMin(first.end) - toMin(first.start),
    breakMin,
    count: ps.length,
    lunchAfter: lunchIdx < 0 ? 0 : lunchIdx + 1,
    lunchMin: lunchIdx < 0 ? 45 : longest,
    afternoonBreakMin: after[0] !== undefined && after[0] !== breakMin ? after[0] : null,
  };
}
export const fromRule = (r: Rule): Period[] =>
  generatePeriods({ firstStart: r.firstStart, lessonMin: r.lessonMin, breakMin: r.breakMin, count: r.count, lunchAfter: r.lunchAfter || null, lunchMin: r.lunchMin, afternoonBreakMin: r.afternoonBreakMin });

/** Bir sayı / süre ayarı: −  değer  + (dokunarak değişir, yazı kutusu klavye açmaz) */
export function Stepper({ label, value, onChange, step = 5, min = 0, max = 600, suffix = ' dk', display }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; display?: string }) {
  const btn = (d: number, icon: 'remove' | 'add', name: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${name}`}
      onPress={() => onChange(Math.min(max, Math.max(min, value + d)))}
      hitSlop={6}
      style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, opacity: pressed ? 0.6 : 1 })}
    >
      <Icon name={icon} size={18} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, gap: 4 }}>
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.faint }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {btn(-step, 'remove', 'azalt')}
        <Text style={{ fontSize: (display ?? '').length > 8 ? 13 : 16, fontWeight: '800', color: colors.ink, textAlign: 'center', flexShrink: 1 }} numberOfLines={1}>
          {display ?? `${value}${suffix}`}
        </Text>
        {btn(step, 'add', 'artır')}
      </View>
    </View>
  );
}

/** Ders ve aralar: ders satırı, altında ara (teneffüs / öğle arası). Satıra dokunulursa onPeriod. */
export function PeriodList({ periods, lunchThresholdMin, onPeriod, gapControls, nowNo, pastNos, note, elevated }: {
  periods: readonly Period[];
  lunchThresholdMin: number;
  onPeriod?: (p: Period) => void;
  /** Aralar ±5 dk (Bu günü düzenle) */
  gapControls?: (afterNo: number, delta: number) => void;
  nowNo?: number | null;
  pastNos?: Set<number>;
  note?: (p: Period) => string | null;
  /** Üst katmanın (alt sayfa) içinde: satırlar kart zemini ve ince çerçeveyle ayrışır (iki tema) */
  elevated?: boolean;
}) {
  const ps = sortPeriods(periods);
  return (
    <View style={{ gap: 5 }}>
      {ps.map((p, i) => {
        const next = ps[i + 1];
        const gap = next ? gapMin(p, next) : 0;
        const lunch = gap >= lunchThresholdMin;
        const now = nowNo === p.no;
        const past = pastNos?.has(p.no);
        return (
          <View key={p.no} style={{ gap: 5 }}>
            <Pressable
              disabled={!onPeriod}
              accessibilityRole={onPeriod ? 'button' : undefined}
              accessibilityLabel={`${p.no}. ders ${p.start}–${p.end}`}
              onPress={() => onPeriod?.(p)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 9, opacity: past ? 0.5 : 1 }}
            >
              <View style={{ width: 46 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink }}>{p.start}</Text>
                <Text style={{ fontSize: 10.5, fontWeight: '600', color: colors.subtle }}>{p.end}</Text>
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: now ? colors.primary : elevated ? colors.card : colors.primarySoft, borderWidth: elevated && !now ? 1 : 0, borderColor: colors.borderStrong }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: now ? colors.onPrimary : colors.ink }}>{p.no}. Ders</Text>
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: now ? colors.onPrimary : colors.subtle }}>{note?.(p) ?? `${toMin(p.end) - toMin(p.start)} dk`}</Text>
              </View>
            </Pressable>
            {next && (
              <View style={{ marginLeft: 55, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, backgroundColor: lunch ? colors.goldSoft : colors.successSoft }}>
                {gapControls && (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${p.no}. dersten sonraki arayı 5 dakika kısalt`} disabled={gap < 5} hitSlop={8} onPress={() => gapControls(p.no, -5)}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: lunch ? colors.gold : colors.success, opacity: gap < 5 ? 0.4 : 1 }}>−5</Text>
                  </Pressable>
                )}
                <Text style={{ fontSize: 11, fontWeight: '700', color: lunch ? colors.gold : colors.success }}>
                  {lunch ? 'Öğle arası' : 'Teneffüs'} · {gap} dk
                </Text>
                {gapControls && (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${p.no}. dersten sonraki arayı 5 dakika uzat`} hitSlop={8} onPress={() => gapControls(p.no, 5)}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: lunch ? colors.gold : colors.success }}>+5</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Tek dersin saatini düzeltme (C2): başlangıç ve bitiş ±5 dk; istenirse sonraki dersler de kayar */
export function PeriodSheet({ period, onClose, onApply }: { period: Period | null; onClose: () => void; onApply: (p: Period, carry: boolean) => void }) {
  const [p, setP] = useState<Period | null>(period);
  const [carry, setCarry] = useState(true);
  useEffect(() => setP(period), [period]);
  if (!p) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const len = toMin(p.end) - toMin(p.start);
  return (
    <Sheet open={Boolean(period)} onClose={onClose}>
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{p.no}. Ders</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stepper label="Başlangıç" value={toMin(p.start)} display={p.start} onChange={(v) => setP({ ...p, start: fmt(v), end: fmt(v + len) })} />
          <Stepper label="Bitiş" value={toMin(p.end)} display={p.end} min={toMin(p.start) + 5} onChange={(v) => setP({ ...p, end: fmt(v) })} />
        </View>
        <T size={12} color={colors.muted}>
          Başlangıç değişince ders süresi ({len} dk) korunur; bitişle süre değişir.
        </T>
        <Chip icon={carry ? 'checkmark' : undefined} selected={carry} label="Sonraki dersleri de kaydır" onPress={() => setCarry((x) => !x)} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={onClose}>
            Vazgeç
          </Button>
          <Button style={{ flex: 1 }} onPress={() => onApply(p, carry)}>
            Uygula
          </Button>
        </View>
      </View>
    </Sheet>
  );
}

/** Tek dersin değişikliğini çizelgeye uygular; carry: sonraki dersler aynı farkla kayar */
export function applyPeriod(periods: readonly Period[], p: Period, carry: boolean): Period[] {
  const ps = sortPeriods(periods);
  const old = ps.find((x) => x.no === p.no);
  if (!old) return ps;
  const endDelta = toMin(p.end) - toMin(old.end);
  let out = ps.map((x) => (x.no === p.no ? p : x));
  if (carry && endDelta) {
    const next = ps[ps.findIndex((x) => x.no === p.no) + 1];
    if (next) out = shiftPeriods(out, next.no, endDelta);
  }
  return out;
}

type Scope = 'auto' | 'days' | 'classes';
export interface EditorValue {
  name: string;
  lessonCount: number | null;
  periods: Period[];
  weekdays: number[];
  classIds: string[];
}

/**
 * Zil düzeni düzenleyici (C1 + C3): ad, kuraldan oluşturma (değer değişince saatler yeniden hesaplanır), satıra
 * dokunup tek saat düzeltme, nerede çalacağı (okul geneli, sabit günler, belirli sınıflar).
 */
export function ScheduleEditorSheet({ open, title, initial, classes, shift, dual, lunchThresholdMin, onClose, onSave }: {
  open: boolean;
  title: string;
  initial: EditorValue;
  classes: ClassRow[];
  shift: Shift;
  dual: boolean;
  lunchThresholdMin: number;
  onClose: () => void;
  onSave: (v: EditorValue) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [rule, setRule] = useState<Rule>(() => (initial.periods.length ? deriveRule(initial.periods) : DEFAULT_RULE));
  const [scope, setScope] = useState<Scope>(initial.classIds.length ? 'classes' : initial.weekdays.length ? 'days' : 'auto');
  const [editing, setEditing] = useState<Period | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setV(initial);
    const r = initial.periods.length ? deriveRule(initial.periods) : DEFAULT_RULE;
    setRule(r);
    if (!initial.periods.length) setV((x) => ({ ...x, periods: fromRule(r) }));
    setScope(initial.classIds.length ? 'classes' : initial.weekdays.length ? 'days' : 'auto');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Kural değişince saatler yeniden hesaplanır (yalnızca kullanıcı bir kural değeri değiştirdiğinde)
  const changeRule = (patch: Partial<Rule>) => {
    const r = { ...rule, ...patch };
    setRule(r);
    setV((x) => ({ ...x, periods: fromRule(r), lessonCount: patch.count ?? x.lessonCount }));
  };
  const ps = sortPeriods(v.periods);
  const sorted = [...classes].filter((c) => (dual ? (c.shift === 'afternoon' ? 'afternoon' : 'morning') === shift : true)).sort((a, b) => compareClassNames(a.name, b.name));

  const save = async () => {
    setError(null);
    const body = {
      ...v,
      weekdays: scope === 'auto' ? [] : v.weekdays,
      classIds: scope === 'classes' ? v.classIds : [],
    };
    if (!body.name.trim()) return setError('Ad yazın.');
    if (scope === 'days' && !body.weekdays.length) return setError('En az bir gün seçin.');
    if (scope === 'classes' && !body.classIds.length) return setError('En az bir sınıf seçin.');
    const bad = validatePeriods(body.periods);
    if (bad) return setError(bad);
    const parsed = bellScheduleSchema.safeParse({ name: body.name, periods: body.periods, lessonCount: body.lessonCount, weekdays: body.weekdays, classIds: body.classIds.length ? body.classIds : null });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Kaydedilemedi');
    setBusy(true);
    try {
      await onSave(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open={open && !editing} onClose={onClose}>
        <SheetScroll contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{title}</Text>
          <Field label="Ad" value={v.name} onChangeText={(name) => setV({ ...v, name })} placeholder="8 derslik gün" maxLength={60} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>Kuraldan oluştur</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stepper label="İlk ders" value={toMin(rule.firstStart)} display={rule.firstStart} onChange={(m) => changeRule({ firstStart: fmt(m) })} />
            <Stepper label="Ders sayısı" value={rule.count} step={1} min={1} max={16} suffix="" onChange={(count) => changeRule({ count })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stepper label="Ders süresi" value={rule.lessonMin} min={10} max={120} onChange={(lessonMin) => changeRule({ lessonMin })} />
            <Stepper label="Teneffüs" value={rule.breakMin} min={0} max={60} onChange={(breakMin) => changeRule({ breakMin })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stepper label="Öğle arası (sonra)" value={rule.lunchAfter} step={1} min={0} max={rule.count - 1} suffix="" display={rule.lunchAfter ? `${rule.lunchAfter}. dersten` : 'yok'} onChange={(lunchAfter) => changeRule({ lunchAfter })} />
            <Stepper label="Öğle süresi" value={rule.lunchMin} min={20} max={120} onChange={(lunchMin) => changeRule({ lunchMin })} />
          </View>
          <T size={12} color={colors.muted}>
            Bir değeri değiştirince saatler yeniden hesaplanır. Tek bir saati düzeltmek için aşağıdaki derse dokunun.
          </T>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>Saatler</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink }}>{ps.length ? `${ps[0]!.start}–${ps.at(-1)!.end}` : '—'}</Text>
          </View>
          <PeriodList elevated periods={ps} lunchThresholdMin={lunchThresholdMin} onPeriod={setEditing} note={(p) => (p.no === ps[0]?.no ? 'dokun: düzelt' : null)} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.muted }}>Nerede çalsın</Text>
          <View style={{ gap: 6 }}>
            {(
              [
                ['auto', 'Okul geneli', 'Günün ders sayısına göre kendiliğinden seçilir'],
                ['days', 'Sabit günler', 'Seçilen günlerde her zaman bu zil'],
                ['classes', 'Belirli sınıflar', 'Yalnızca seçilen sınıflar için'],
              ] as const
            ).map(([value, label, help]) => {
              const on = scope === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setScope(value)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderColor: on ? colors.primary : colors.border, backgroundColor: colors.card, borderRadius: 14, padding: 10 }}
                >
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: on ? 6 : 2, borderColor: on ? colors.primary : colors.subtle }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.ink }}>{label}</Text>
                    <Text style={{ fontSize: 11.5, color: colors.faint }}>{help}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {scope === 'classes' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {sorted.map((c) => {
                const on = v.classIds.includes(c.id);
                return <Chip key={c.id} label={c.name} selected={on} onPress={() => setV({ ...v, classIds: on ? v.classIds.filter((x) => x !== c.id) : [...v.classIds, c.id] })} />;
              })}
            </View>
          )}
          {scope !== 'auto' && (
            <>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.faint }}>{scope === 'classes' ? 'GÜNLER (boşsa o sınıfların her günü)' : 'GÜNLER'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const on = v.weekdays.includes(d);
                  return <Chip key={d} label={WEEKDAY_SHORT[d]!} selected={on} onPress={() => setV({ ...v, weekdays: on ? v.weekdays.filter((x) => x !== d) : [...v.weekdays, d].sort() })} />;
                })}
              </View>
            </>
          )}
          {error && <T color={colors.danger}>{error}</T>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="secondary" style={{ flex: 1 }} onPress={onClose}>
              Vazgeç
            </Button>
            <Button style={{ flex: 1 }} loading={busy} onPress={() => void save()}>
              Kaydet
            </Button>
          </View>
        </SheetScroll>
      </Sheet>
      <PeriodSheet
        period={editing}
        onClose={() => setEditing(null)}
        onApply={(p, carry) => {
          setV((x) => ({ ...x, periods: applyPeriod(x.periods, p, carry) }));
          setEditing(null);
        }}
      />
    </>
  );
}

/** Küçük sayı rozeti (ör. grup kartındaki sınıf sayısı) */
export function CountText({ n }: { n: number }) {
  return <Text style={{ ...centeredText(11), fontWeight: '800', color: colors.muted }}>{n}</Text>;
}
