import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { api } from './api.ts';
import { useAuth, useSchoolPath } from './auth.tsx';
import { Sheet } from './sheet.tsx';
import { Text } from './text.tsx';
import { colors } from './theme.ts';
import { Button, T } from './ui.tsx';

/*
 * İşletmelerde mesleki eğitim: mobil ekranların ortak parçaları (kodlar, renkler, açıklama bandı, anında kayıt ve Geri al).
 * Kodlar e-Okul'daki gibidir: D özürsüz devamsız, İ izinli, R raporlu, H hasta sevkli, T tatil, K işletme kapalı;
 * X işletmede (işareti siler), O okulda. Her gün S (sabah) ve Ö (öğle) iki bölümdür.
 */

export type Cell = 'O' | 'X' | 'D' | 'İ' | 'R' | 'H' | 'T' | 'TA' | 'K' | 'W' | '';
export type Code = 'X' | 'D' | 'İ' | 'R' | 'H' | 'T' | 'K';
export type Half = 'am' | 'pm';
export const HALVES: Half[] = ['am', 'pm'];
export const HALF_SHORT: Record<Half, string> = { am: 'S', pm: 'Ö' };

/** Öğretmenin değiştirebileceği bölüm: işletme günü ya da henüz gelmemiş işletme günü */
export const pickable = (c: Cell) => c === 'X' || c === 'D' || c === 'İ' || c === 'R' || c === 'H' || c === 'T' || c === 'K' || c === '';
export const letter = (c: Cell) => (c === 'TA' ? 'T' : c === 'W' || c === '' ? '' : c);
/** Geri al için önceki kod: işaretsiz bölüm X (sil) */
export const prevCode = (c: Cell): Code => (c === 'D' || c === 'İ' || c === 'R' || c === 'H' || c === 'T' || c === 'K' ? c : 'X');

/** Kod renkleri (panel çizelgesiyle aynı) */
export const TONE: Record<string, { bg: string; fg: string; border?: string }> = {
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
  '': { bg: '#ffffff', fg: '#a8a29e', border: '#e7e3dc' },
};

/** "Devamsızlığın gösterileceği semboller" bandı (e-Okul sırası) */
export const LEGEND_BAND: [string, string][] = [
  ['D', 'Özürsüz Devamsız'],
  ['İ', 'İzinli'],
  ['R', 'Raporlu'],
  ['H', 'Hasta Sevkli'],
  ['S', 'Sabah'],
  ['Ö', 'Öğle'],
  ['T', 'Resmi Tatil'],
  ['X', 'İşletmede'],
  ['O', 'Okulda'],
  ['K', 'İşletme Kapalı'],
];

export function LegendBand() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
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
 * Anında kayıt: her işaret dokununca kaydedilir; son kayıt "Geri al" ile önceki kodlara döner. Devamsızlık birkaç dakika
 * sonra müdür yardımcısına bildirilir (bu sürede düzeltilen işaret bildirilmez).
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
        setError(e instanceof Error ? e.message : 'Kaydedilemedi');
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
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
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
        <Button variant="secondary" onPress={() => setDays((n) => Math.max(1, n - 1))} disabled={days <= 1}>
          −
        </Button>
        <View style={{ alignItems: 'center', minWidth: 110 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.ink }}>{days}</Text>
          <T size={12} color={colors.faint}>
            takvim günü
          </T>
        </View>
        <Button variant="secondary" onPress={() => setDays((n) => Math.min(31, n + 1))} disabled={days >= 31}>
          +
        </Button>
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
