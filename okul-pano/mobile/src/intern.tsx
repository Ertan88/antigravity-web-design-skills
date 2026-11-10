import { errorText } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { api } from './api.ts';
import { useAuth, useSchoolPath } from './auth.tsx';
import { Sheet } from './sheet.tsx';
import { Text } from './text.tsx';
import { colors, dark } from './theme.ts';
import { Button, Field, Icon, T } from './ui.tsx';

/*
 * İşletmelerde mesleki eğitim: mobil ekranların ortak parçaları (kodlar, renkler, açıklama bandı, anında kayıt ve Geri al).
 * Kodlar e-Okul'daki gibidir: D özürsüz devamsız, İ izinli, R raporlu, H hasta sevkli, T tatil, K işletme kapalı;
 * X işletmede (koordinatör işaretler), O okulda; ? kontrol edilmedi (işaret yok). Her gün S (sabah) ve Ö (öğle) iki
 * bölümdür. Devamsızlıklar koordinatör "Gönder" deyince müdür yardımcısına gider.
 */

export type Cell = 'O' | 'X' | 'D' | 'İ' | 'R' | 'H' | 'T' | 'TA' | 'K' | 'W' | '?' | '';
/** '-': işareti kaldırır (kontrol edilmedi) */
export type Code = '-' | 'X' | 'D' | 'İ' | 'R' | 'H' | 'T' | 'K';
export type Half = 'am' | 'pm';
export const HALVES: Half[] = ['am', 'pm'];
export const HALF_SHORT: Record<Half, string> = { am: 'S', pm: 'Ö' };

/** Öğretmenin değiştirebileceği bölüm: işletme günü ya da henüz gelmemiş işletme günü */
export const pickable = (c: Cell) => c === '?' || c === 'X' || c === 'D' || c === 'İ' || c === 'R' || c === 'H' || c === 'T' || c === 'K' || c === '';
export const letter = (c: Cell) => (c === 'TA' ? 'T' : c === 'W' || c === '' ? '' : c);
/** Geri al için önceki kod: işaretsiz bölüm "-" (sil) */
export const prevCode = (c: Cell): Code => (c === 'X' || c === 'D' || c === 'İ' || c === 'R' || c === 'H' || c === 'T' || c === 'K' ? c : '-');

type Tone = { bg: string; fg: string; border?: string; dashed?: boolean };

/** Kod renkleri (panel çizelgesiyle aynı), açık tema */
const TONE_LIGHT: Record<string, Tone> = {
  X: { bg: '#ffffff', fg: '#334155', border: '#94a3b8' },
  D: { bg: '#ef4444', fg: '#ffffff' },
  İ: { bg: '#99f6e4', fg: '#134e4a' },
  R: { bg: '#ddd6fe', fg: '#4c1d95' },
  H: { bg: '#fed7aa', fg: '#7c2d12' },
  T: { bg: '#bae6fd', fg: '#0c4a6e', border: '#0369a1' },
  TA: { bg: '#bae6fd', fg: '#0c4a6e' },
  K: { bg: '#fde68a', fg: '#713f12' },
  O: { bg: '#bbf7d0', fg: '#14532d' },
  W: { bg: '#ece8e1', fg: '#a8a29e' },
  '?': { bg: '#ffffff', fg: '#a8a29e', border: '#d6d3d1', dashed: true },
  '': { bg: '#ffffff', fg: '#a8a29e', border: '#e7e3dc' },
};

/** Koyu tema: koyu zemin, açık harf (panelin koyu temasıyla aynı) */
const TONE_DARK: Record<string, Tone> = {
  X: { bg: '#26231f', fg: '#f5f3ef', border: '#a8a29e' },
  D: { bg: '#dc2626', fg: '#ffffff' },
  İ: { bg: '#134e4a', fg: '#99f6e4', border: '#0f766e' },
  R: { bg: '#3b2a6b', fg: '#ddd6fe', border: '#7c3aed' },
  H: { bg: '#5a2a10', fg: '#fed7aa', border: '#c2410c' },
  T: { bg: '#0c3a5a', fg: '#bae6fd', border: '#38bdf8' },
  TA: { bg: '#0c3a5a', fg: '#bae6fd' },
  K: { bg: '#5a430c', fg: '#fde68a', border: '#b45309' },
  O: { bg: '#123d2c', fg: '#a7f3d0', border: '#1f6b4d' },
  W: { bg: '#2a2723', fg: '#8a837b' },
  '?': { bg: 'transparent', fg: '#d6d1c8', border: '#8a837b', dashed: true },
  '': { bg: 'transparent', fg: '#8a837b', border: '#4d4740' },
};

/** Kod renkleri: o anki temaya göre (tema değişince ekranlar yeniden çizilir) */
export const TONE: Record<string, Tone> = new Proxy({} as Record<string, Tone>, {
  get: (_t, k: string) => (dark ? TONE_DARK : TONE_LIGHT)[k],
});

/** "Devamsızlığın gösterileceği semboller" bandı (e-Okul sırası) */
export const LEGEND_BAND: [string, string][] = [
  ['X', 'İşletmede'],
  ['?', 'Kontrol edilmedi'],
  ['D', 'Özürsüz Devamsız'],
  ['İ', 'İzinli'],
  ['R', 'Raporlu'],
  ['H', 'Hasta Sevkli'],
  ['S', 'Sabah'],
  ['Ö', 'Öğle'],
  ['T', 'Resmi Tatil'],
  ['O', 'Okulda'],
  ['K', 'İşletme Kapalı'],
];

export function LegendBand() {
  return (
    <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
      {LEGEND_BAND.map(([k, text]) => {
        const t = TONE[k] ?? { bg: colors.primarySoft, fg: colors.ink };
        return (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ minWidth: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, borderWidth: t.border ? 1 : 0, borderColor: t.border }}>
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: t.fg }}>{k}</Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>{text}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const shortDate = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

export interface MarkBody {
  date: string;
  until?: string;
  items: { studentId: string; half: Half; code: Code }[];
}

/**
 * Anında kayıt: her işaret dokununca kaydedilir; son kayıt "Geri al" ile önceki kodlara döner. Devamsızlık hemen
 * bildirilmez; koordinatör "Gönder" deyince müdür yardımcısına gider.
 */
export function useMarks() {
  const { school } = useAuth();
  const path = useSchoolPath('internship/marks');
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ label: string; body: MarkBody } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 7000);
    return () => clearTimeout(t);
  }, [undo]);
  const save = useCallback(
    async (body: MarkBody, undoInfo?: { label: string; body: MarkBody } | null) => {
      setBusy(true);
      setError(null);
      try {
        await api(path, { method: 'POST', body });
        setUndo(undoInfo ?? null);
        await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === school?.id && String(q.queryKey[1] ?? '').startsWith('internship') });
        return true;
      } catch (e) {
        setError(errorText(e, 'Kaydedilemedi'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [path, qc, school?.id],
  );
  const undoLast = useCallback(() => {
    if (undo) void save(undo.body, null);
  }, [undo, save]);
  return { save, busy, error, undo, undoLast, clearError: () => setError(null) };
}

/** Altta kayıt sonucu ve Geri al */
export function UndoBar({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.ink, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 }}>
      <Text style={{ flex: 1, color: colors.bg, fontSize: 13, fontWeight: '700' }} numberOfLines={2}>
        {label}
      </Text>
      <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={8} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' }}>
        <Text style={{ color: colors.bg, fontWeight: '800', fontSize: 13 }}>Geri al</Text>
      </Pressable>
    </View>
  );
}

const SHEET_CODES: { code: Code; label: string }[] = [
  { code: 'R', label: 'Raporlu (R)' },
  { code: 'İ', label: 'İzinli (İ)' },
  { code: 'H', label: 'Hasta sevkli (H)' },
];

/** Birkaç günlük rapor / izin / sevk: başlangıç günü ve gün sayısı; okul günleri ve tatiller sunucuda atlanır */
export function ReportSheet({ student, from, onClose, onSaved }: { student: { id: string; fullName: string }; from: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const path = useSchoolPath('internship/marks');
  const [days, setDays] = useState(3);
  const [code, setCode] = useState<Code>('R');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const until = addDays(from, days - 1);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'POST', body: { date: from, until, items: HALVES.map((half) => ({ studentId: student.id, half, code })) } });
      onSaved(`${student.fullName}: ${days === 1 ? shortDate(from) : `${shortDate(from)} – ${shortDate(until)}`} ${SHEET_CODES.find((c) => c.code === code)!.label.split(' (')[0]!.toLocaleLowerCase('tr-TR')} kaydedildi.`);
    } catch (e) {
      setError(errorText(e, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{student.fullName} · birkaç gün</Text>
      <T size={12.5} color={colors.faint} style={{ marginTop: 4 }}>
        Seçilen günler tam gün işaretlenir. Aradaki okul günleri, hafta sonu ve tatiller atlanır.
      </T>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
        {SHEET_CODES.map((c) => {
          const on = c.code === code;
          const t = TONE[c.code]!;
          return (
            <Pressable
              key={c.code}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setCode(c.code)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.border, backgroundColor: on ? t.bg : colors.card }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: on ? t.fg : colors.muted }}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16, alignSelf: 'center' }}>
        <Button variant="secondary" icon="remove" accessibilityLabel="Bir gün azalt" onPress={() => setDays((n) => Math.max(1, n - 1))} disabled={days <= 1} style={{ width: 56 }} />
        <View style={{ alignItems: 'center', minWidth: 110 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.ink }}>{days}</Text>
          <T size={12} color={colors.faint}>
            takvim günü
          </T>
        </View>
        <Button variant="secondary" icon="add" accessibilityLabel="Bir gün artır" onPress={() => setDays((n) => Math.min(31, n + 1))} disabled={days >= 31} style={{ width: 56 }} />
      </View>
      <T size={14} weight="700" style={{ textAlign: 'center', marginTop: 10 }}>
        {days === 1 ? shortDate(from) : `${shortDate(from)} – ${shortDate(until)}`}
      </T>
      {error && (
        <T size={13} color={colors.danger} style={{ marginTop: 8 }}>
          {error}
        </T>
      )}
      <View style={{ marginTop: 14 }}>
        <Button loading={busy} onPress={() => void save()}>
          Kaydet
        </Button>
      </View>
    </Sheet>
  );
}

/** Gönderilmemiş devamsızlık (müdür yardımcısına henüz gitmedi) */
export interface PendingMark {
  id: string;
  studentId: string;
  fullName: string;
  className: string | null;
  businessName: string | null;
  date: string;
  half: Half;
  code: 'D' | 'İ' | 'R' | 'H';
  userName: string;
}

const days = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
const PENDING_TEXT: Record<PendingMark['code'], string> = { D: 'özürsüz', İ: 'izinli', R: 'raporlu', H: 'hasta sevkli' };

/** Altta: "N devamsızlık gönderilmedi · Gönder…" */
export function PendingStrip({ rows, onPress }: { rows: PendingMark[]; onPress: () => void }) {
  const students = new Set(rows.map((r) => r.studentId)).size;
  const ink = dark ? '#fde68a' : '#92400e';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: dark ? '#2e2208' : '#fef3c7', borderWidth: 1, borderColor: dark ? '#b45309' : '#fcd34d', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '800', color: ink }}>{days(rows.length / 2)} günlük devamsızlık gönderilmedi</Text>
        <Text style={{ fontSize: 11.5, color: ink }}>{students} öğrenci · müdür yardımcısına henüz gitmedi</Text>
      </View>
      <Button size="sm" onPress={onPress}>
        Gönder…
      </Button>
    </View>
  );
}

/** Gönderilmemiş devamsızlıklar: öğrenci ve koda göre gruplanır, seçilenler müdür yardımcısına gönderilir */
export function SendSheet({ rows, onClose, onSent }: { rows: PendingMark[]; onClose: () => void; onSent: (msg: string) => void }) {
  const path = useSchoolPath('internship/send');
  const groups = (() => {
    const m = new Map<string, PendingMark[]>();
    for (const r of rows) m.set(`${r.studentId}|${r.code}`, [...(m.get(`${r.studentId}|${r.code}`) ?? []), r]);
    return [...m.entries()].map(([key, list]) => ({ key, list }));
  })();
  const [off, setOff] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = groups.filter((g) => !off.has(g.key)).flatMap((g) => g.list.map((r) => r.id));
  const when = (list: PendingMark[]) => {
    const ds = [...new Set(list.map((r) => r.date))].sort();
    if (ds.length === 1) return `${shortDate(ds[0]!)} · ${list.length === 2 ? 'tam gün' : list[0]!.half === 'am' ? 'sabah' : 'öğle'}`;
    return `${shortDate(ds[0]!)} – ${shortDate(ds[ds.length - 1]!)} · ${days(list.length / 2)} gün`;
  };
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sent: number }>(path, { method: 'POST', body: { ids, note: note.trim() || undefined } });
      onSent(`${days(r.sent / 2)} günlük devamsızlık müdür yardımcısına gönderildi.`);
    } catch (e) {
      setError(errorText(e, 'Gönderilemedi'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>Müdür yardımcısına gönder</Text>
      <T size={12.5} color={colors.faint} style={{ marginTop: 4 }}>
        Kontrol edip göndermek istediklerinizi seçin; seçmedikleriniz sonra gönderilmek üzere bekler.
      </T>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300, marginTop: 10, flexShrink: 1 }}>
        {groups.map((g) => {
          const r = g.list[0]!;
          const on = !off.has(g.key);
          const t = TONE[r.code]!;
          return (
            <Pressable
              key={g.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() =>
                setOff((s) => {
                  const n = new Set(s);
                  if (on) n.add(g.key);
                  else n.delete(g.key);
                  return n;
                })
              }
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.divider }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: on ? 0 : 2, borderColor: colors.subtle, backgroundColor: on ? colors.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {on && <Icon name="checkmark" size={16} color={colors.bg} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
                  {r.fullName}
                </Text>
                {r.businessName && (
                  <Text style={{ fontSize: 11.5, color: colors.subtle }} numberOfLines={1}>
                    {r.businessName}
                  </Text>
                )}
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.ink, marginTop: 1 }}>{when(g.list)}</Text>
              </View>
              <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: t.bg }}>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: t.fg }}>
                  {r.code} · {PENDING_TEXT[r.code]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ marginTop: 10 }}>
        <Field label="Not (isteğe bağlı)" value={note} onChangeText={setNote} multiline maxLength={500} placeholder="ör. Veli ile görüşüldü" />
      </View>
      {error && (
        <T size={13} color={colors.danger} style={{ marginTop: 8 }}>
          {error}
        </T>
      )}
      <View style={{ marginTop: 12 }}>
        <Button loading={busy} disabled={!ids.length} icon="send" onPress={() => void send()}>
          {ids.length ? `${days(ids.length / 2)} günü gönder` : 'Seçim yok'}
        </Button>
      </View>
    </Sheet>
  );
}

/** Toplu "İşletmede": seçilen dönemde yalnızca "?" (kontrol edilmedi) bölümler X olur; konan işaretlere dokunulmaz */
export function FillSheet({
  today,
  businesses,
  businessId,
  onClose,
  onDone,
}: {
  today: string;
  businesses: { id: string; name: string }[];
  businessId: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const path = useSchoolPath('internship/marks/fill');
  const weekday = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const RANGES = [
    { key: 'today', label: `Yalnız bugün (${shortDate(today)})`, from: today },
    { key: 'week', label: `Bu hafta, bugüne kadar (${shortDate(addDays(today, 1 - weekday))} – ${shortDate(today)})`, from: addDays(today, 1 - weekday) },
    { key: 'two', label: `Son iki hafta (${shortDate(addDays(today, -6 - weekday))} – ${shortDate(today)})`, from: addDays(today, -6 - weekday) },
    { key: 'month', label: `Bu ay, bugüne kadar (${shortDate(`${today.slice(0, 7)}-01`)} – ${shortDate(today)})`, from: `${today.slice(0, 7)}-01` },
  ];
  const [range, setRange] = useState('week');
  const [biz, setBiz] = useState(businessId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opt = (on: boolean) => ({ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.border, backgroundColor: colors.card });
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ changed: number }>(path, { method: 'POST', body: { from: RANGES.find((x) => x.key === range)!.from, until: today, businessId: biz || null } });
      onDone(r.changed ? `${days(r.changed / 2)} gün “İşletmede” işaretlendi.` : 'İşaretsiz gün yoktu.');
    } catch (e) {
      setError(errorText(e, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>İşaretsizleri “İşletmede” yap</Text>
      <T size={12.5} color={colors.faint} style={{ marginTop: 4 }}>
        Önce devamsızlıkları (D, İ, R, H) işaretleyin. Bu işlem yalnızca “?” olan bölümleri X yapar; konan işaretlere dokunmaz.
      </T>
      <T size={11.5} weight="800" color={colors.faint} style={{ marginTop: 12, marginBottom: 6 }}>
        HANGİ GÜNLER
      </T>
      <View style={{ gap: 6 }}>
        {RANGES.map((x) => (
          <Pressable key={x.key} accessibilityRole="radio" accessibilityState={{ selected: range === x.key }} onPress={() => setRange(x.key)} style={opt(range === x.key)}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
      {businesses.length > 1 && (
        <>
          <T size={11.5} weight="800" color={colors.faint} style={{ marginTop: 12, marginBottom: 6 }}>
            HANGİ ÖĞRENCİLER
          </T>
          <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {[{ id: '', name: 'Bütün işletmelerim' }, ...businesses].map((b) => (
              <Pressable key={b.id || 'all'} accessibilityRole="radio" accessibilityState={{ selected: biz === b.id }} onPress={() => setBiz(b.id)} style={[opt(biz === b.id), { paddingVertical: 7 }]}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.ink }}>{b.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
      {error && (
        <T size={13} color={colors.danger} style={{ marginTop: 8 }}>
          {error}
        </T>
      )}
      <View style={{ marginTop: 14 }}>
        <Button loading={busy} icon="checkmark-done" onPress={() => void run()}>
          İşletmede işaretle
        </Button>
      </View>
    </Sheet>
  );
}
