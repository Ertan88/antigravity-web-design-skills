import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useSchoolQuery } from '../src/data.ts';
import { Text } from '../src/text.tsx';
import { colors, radius } from '../src/theme.ts';
import { Button, Card, Chip, Empty, ErrorNote, Loading, Screen, T } from '../src/ui.tsx';

/*
 * İşletme ziyareti (koordinatör öğretmen): o gün işletmedeki öğrencilerin devamı. Her gün iki bölümdür (öğleden önce,
 * öğleden sonra). Okul günleri (O) ve takvim tatilleri (T) kendiliğinden gelir; öğretmen D (devamsız), R (raporlu)
 * işaretler, işletme kapalıysa K, tatilse T. D ve R kaydedilince koordinatör müdür yardımcısına bildirim gider.
 */

type Cell = 'O' | 'X' | 'D' | 'R' | 'T' | 'TA' | 'K' | 'W' | '';
type Code = 'X' | 'D' | 'R' | 'T' | 'K';
type Half = 'am' | 'pm';

interface DayStudent {
  id: string;
  fullName: string;
  schoolNo: string;
  className: string | null;
  am: Cell;
  pm: Cell;
  editable: boolean;
}
interface DayData {
  date: string;
  today: string;
  day: { date: string; weekday: number; holiday: string | null; halfDay: string | null };
  managerAssigned: boolean;
  businesses: { id: string; name: string; own: boolean; students: DayStudent[] }[];
}

const editable = (c: Cell) => c === 'X' || c === 'D' || c === 'R' || c === 'T' || c === 'K' || c === '';
const letter = (c: Cell) => (c === 'TA' ? 'T' : c === 'W' || c === '' ? '' : c);

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const dayTitle = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

/** Kod renkleri (panel çizelgesiyle aynı) */
const TONE: Record<string, { bg: string; fg: string; border?: string }> = {
  X: { bg: '#f0fdf4', fg: '#14532d', border: '#86efac' },
  D: { bg: '#ef4444', fg: '#ffffff' },
  R: { bg: '#ddd6fe', fg: '#4c1d95' },
  T: { bg: '#bae6fd', fg: '#0c4a6e', border: '#0369a1' },
  TA: { bg: '#bae6fd', fg: '#0c4a6e' },
  K: { bg: '#fde68a', fg: '#713f12' },
  O: { bg: '#bbf7d0', fg: '#14532d' },
};

const CHOICES: { code: Code; label: string }[] = [
  { code: 'X', label: 'İşletmede' },
  { code: 'D', label: 'D' },
  { code: 'R', label: 'R' },
];

const LEGEND: [string, string][] = [
  ['X', 'İşletmede, devam etti'],
  ['D', 'Devamsız (özürsüz)'],
  ['R', 'Raporlu (özürlü)'],
  ['K', 'İşletme kapalı (işletmedeki bütün öğrenciler)'],
  ['T', 'Tatil (bütün öğrenciler)'],
  ['O', 'Okulda (ders programından)'],
];

export default function Isletme() {
  const { school } = useAuth();
  const { tarih } = useLocalSearchParams<{ tarih?: string }>();
  const [date, setDate] = useState<string | null>(tarih && /^\d{4}-\d{2}-\d{2}$/.test(tarih) ? tarih : null);
  const day = useSchoolQuery<DayData>(`internship/day${date ? `?date=${date}` : ''}`);
  const path = useSchoolPath('internship/marks');
  const qc = useQueryClient();
  const d = day.data;
  const [bizId, setBizId] = useState<string | null>(null);
  /** Kaydedilmemiş seçimler: öğrenci|bölüm -> kod */
  const [edits, setEdits] = useState<Map<string, Code>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setEdits(new Map());
    setSaved(null);
    setError(null);
  }, [d?.date]);
  useEffect(() => {
    if (d && !d.businesses.some((b) => b.id === bizId)) setBizId(d.businesses[0]?.id ?? null);
  }, [d, bizId]);

  const biz = d?.businesses.find((b) => b.id === bizId) ?? null;
  const current = (s: DayStudent, half: Half): Cell => {
    const e = edits.get(`${s.id}|${half}`);
    return e ?? s[half];
  };
  const set = (s: DayStudent, half: Half, code: Code) =>
    setEdits((m) => {
      const n = new Map(m);
      if (s[half] === code || (code === 'X' && s[half] === 'X')) n.delete(`${s.id}|${half}`);
      else n.set(`${s.id}|${half}`, code);
      return n;
    });
  /** İşletmedeki bütün öğrencilere (K) ya da bütün öğrencilere (T) */
  const setAll = (code: Code) => {
    if (!biz) return;
    setEdits((m) => {
      const n = new Map(m);
      for (const s of biz.students)
        for (const half of ['am', 'pm'] as Half[]) if (s.editable && editable(s[half])) (s[half] === code ? n.delete(`${s.id}|${half}`) : n.set(`${s.id}|${half}`, code));
      return n;
    });
  };

  const changes = useMemo(() => [...edits].map(([k, code]) => ({ studentId: k.split('|')[0]!, half: k.split('|')[1] as Half, code })), [edits]);
  const alerts = new Set(changes.filter((c) => c.code === 'D' || c.code === 'R').map((c) => c.studentId)).size;

  const save = async () => {
    if (!d || !changes.length) return;
    setBusy(true);
    setError(null);
    try {
      // T ve K bir kez gönderilir (sunucu kapsamına uygular); öğrencinin kendi seçimleri ayrıca
      const bulk = changes.filter((c) => c.code === 'T' || c.code === 'K');
      const seen = new Set<string>();
      const items = [
        ...bulk.filter((c) => {
          const k = `${c.code}|${c.half}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }),
        ...changes.filter((c) => c.code !== 'T' && c.code !== 'K'),
      ];
      const r = await api<{ changed: number; notified?: number }>(path, { method: 'POST', body: { date: d.date, items } });
      setEdits(new Map());
      setSaved(r.notified ? 'Kaydedildi; koordinatör müdür yardımcısına bildirim gönderildi.' : 'Kaydedildi.');
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === school?.id && String(q.queryKey[1] ?? '').startsWith('internship') });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const shown = d?.date ?? date;
  const off = d && (d.day.weekday >= 6 || d.day.holiday);

  return (
    <Screen
      title="Ziyaret kaydı"
      subtitle={shown ? `${dayTitle(shown)}${d && d.date === d.today ? ' · bugün' : ''}` : undefined}
      back
      refreshing={day.isRefetching}
      onRefresh={() => void day.refetch()}
      footer={
        changes.length ? (
          <Button loading={busy} onPress={() => void save()} size="lg">
            {alerts ? `Kaydet · ${alerts} öğrenci bildirilecek` : 'Kaydet'}
          </Button>
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" size="sm" icon="chevron-back" onPress={() => d && setDate(addDays(d.date, -1))}>
          Önceki gün
        </Button>
        {d && d.date !== d.today && (
          <Button variant="secondary" size="sm" onPress={() => setDate(null)}>
            Bugün
          </Button>
        )}
        <View style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onPress={() => d && setDate(addDays(d.date, 1))} disabled={!d || d.date >= d.today}>
          Sonraki gün
        </Button>
      </View>
      <ErrorNote error={day.error} />
      {!d ? (
        <Loading />
      ) : !d.businesses.length ? (
        <Empty icon="business-outline" title="İşletme yok" text="Koordinatör olduğunuz işletme ya da işletmeye bağlı öğrenci yok. İşletmeleri yönetim panelinden idare tanımlar." />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {d.businesses.map((b) => (
              <Chip key={b.id} label={`${b.name} · ${b.students.length}`} selected={b.id === bizId} onPress={() => setBizId(b.id)} />
            ))}
          </ScrollView>
          {!d.managerAssigned && (
            <Card tone="warning">
              <T size={13}>Koordinatör müdür yardımcısı seçilmemiş; devamsızlık bildirimi kimseye gitmez. Okul yönetimi Genel Ayarlar'dan seçer.</T>
            </Card>
          )}
          {off ? (
            <Card>
              <T weight="700">{d.day.holiday ?? 'Hafta sonu'}</T>
              <T size={13} color={colors.faint}>
                Bu gün işletmede eğitim yok.
              </T>
            </Card>
          ) : (
            biz && (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button variant="secondary" size="sm" onPress={() => setAll('K')}>
                    İşletme kapalı (K)
                  </Button>
                  <Button variant="secondary" size="sm" onPress={() => setAll('T')}>
                    Tatil (T)
                  </Button>
                </View>
                {biz.students.map((s) => (
                  <Card key={s.id} style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
                        {s.fullName}
                      </Text>
                      <T size={12} color={colors.faint}>
                        No {s.schoolNo}
                        {s.className ? ` · ${s.className}` : ''}
                      </T>
                    </View>
                    {(['am', 'pm'] as Half[]).map((half) => (
                      <HalfRow key={half} half={half} cell={current(s, half)} base={s[half]} canEdit={s.editable} onPick={(c) => set(s, half, c)} />
                    ))}
                  </Card>
                ))}
                {(changes.some((c) => c.code === 'T') || changes.some((c) => c.code === 'K')) && (
                  <T size={12.5} color={colors.muted}>
                    T işletmeye giden bütün öğrencilere, K bu işletmedeki bütün öğrencilere işaretlenir.
                  </T>
                )}
              </>
            )
          )}
          {error && (
            <T size={13} color={colors.danger}>
              {error}
            </T>
          )}
          {saved && !changes.length && (
            <T size={13} color={colors.success} weight="700">
              {saved}
            </T>
          )}
          <Legend />
        </>
      )}
    </Screen>
  );
}

function HalfRow({ half, cell, base, canEdit, onPick }: { half: Half; cell: Cell; base: Cell; canEdit: boolean; onPick: (c: Code) => void }) {
  const label = half === 'am' ? 'ÖÖ' : 'ÖS';
  if (!editable(base) || !canEdit) {
    const t = TONE[cell];
    const text = cell === 'O' ? 'Okulda' : cell === 'TA' ? 'Tatil' : cell === '' ? '—' : letter(cell);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ width: 30, fontSize: 11.5, fontWeight: '800', color: colors.faint }}>{label}</Text>
        <View style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: t?.bg ?? colors.primarySoft }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: t?.fg ?? colors.muted }}>{text}</Text>
        </View>
      </View>
    );
  }
  const now = cell === '' ? 'X' : cell;
  // Dördüncü seçenek: işletme kapalı (K, işletmedeki bütün öğrencilere); tatil işaretliyse T görünür
  const extra = [now === 'T' ? { code: 'T' as Code, label: 'T' } : { code: 'K' as Code, label: 'K' }];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ width: 30, fontSize: 11.5, fontWeight: '800', color: colors.faint }}>{label}</Text>
      {[...CHOICES, ...extra].map((c) => {
        const on = now === c.code;
        const t = TONE[c.code]!;
        return (
          <Pressable
            key={c.code}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label} ${c.label}`}
            onPress={() => onPick(c.code)}
            style={{
              flex: c.code === 'X' ? 1.7 : 1,
              borderRadius: 10,
              paddingVertical: 9,
              alignItems: 'center',
              borderWidth: on ? 2 : 1,
              borderColor: on ? (t.border ?? t.bg) : colors.border,
              backgroundColor: on ? t.bg : colors.card,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '800', color: on ? t.fg : colors.muted }}>{c.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Legend() {
  return (
    <View style={{ gap: 6, marginTop: 4, padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft }}>
      {LEGEND.map(([code, text]) => {
        const t = TONE[code]!;
        return (
          <View key={code} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 22, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, borderWidth: t.border ? 1 : 0, borderColor: t.border }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: t.fg }}>{code}</Text>
            </View>
            <T size={12} color={colors.muted}>
              {text}
            </T>
          </View>
        );
      })}
      <T size={11.5} color={colors.faint}>
        Üst satır öğleden önce (ÖÖ), alt satır öğleden sonra (ÖS); her biri yarım gün sayılır. D ve R kaydedilince koordinatör müdür yardımcısına bildirim gider.
      </T>
    </View>
  );
}
