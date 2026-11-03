import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useSchoolQuery } from '../src/data.ts';
import { Text } from '../src/text.tsx';
import { colors, radius } from '../src/theme.ts';
import { Sheet } from '../src/sheet.tsx';
import { Button, Card, Chip, Empty, ErrorNote, Field, Loading, Screen, T } from '../src/ui.tsx';

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
interface BusinessInfo {
  phone: string | null;
  address: string | null;
  contactName: string | null;
  trainerName: string | null;
  email: string | null;
  field: string | null;
  notes: string | null;
}
const INFO_FIELDS: { key: keyof BusinessInfo; label: string; multiline?: boolean; keyboard?: 'phone-pad' | 'email-address' }[] = [
  { key: 'field', label: 'Faaliyet alanı / dal' },
  { key: 'contactName', label: 'İşletme yetkilisi' },
  { key: 'trainerName', label: 'Usta öğretici / eğitici personel' },
  { key: 'phone', label: 'Telefon', keyboard: 'phone-pad' },
  { key: 'email', label: 'E-posta', keyboard: 'email-address' },
  { key: 'address', label: 'Adres', multiline: true },
  { key: 'notes', label: 'Notlar', multiline: true },
];
interface DayData {
  date: string;
  today: string;
  day: { date: string; weekday: number; holiday: string | null; halfDay: string | null };
  managerAssigned: boolean;
  businesses: { id: string; name: string; own: boolean; editable: boolean; info: BusinessInfo | null; students: DayStudent[] }[];
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
  /** Birkaç günlük rapor girilen öğrenci */
  const [report, setReport] = useState<DayStudent | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

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
      if (s[half] === code || (code === 'X' && (s[half] === 'X' || s[half] === ''))) n.delete(`${s.id}|${half}`);
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
  const future = Boolean(d && d.date > d.today);
  const done = (msg: string) => {
    setSaved(msg);
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === school?.id && String(q.queryKey[1] ?? '').startsWith('internship') });
  };
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
        <Button variant="secondary" size="sm" onPress={() => d && setDate(addDays(d.date, 1))} disabled={!d || d.date >= addDays(d.today, 90)}>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
            {d.businesses.map((b) => (
              <Chip key={b.id} label={`${b.name} · ${b.students.length}`} selected={b.id === bizId} onPress={() => setBizId(b.id)} />
            ))}
          </ScrollView>
          {!d.managerAssigned && (
            <Card tone="warning">
              <T size={13}>Koordinatör müdür yardımcısı seçilmemiş; devamsızlık bildirimi kimseye gitmez. Okul yönetimi Genel Ayarlar'dan seçer.</T>
            </Card>
          )}
          {biz && <BusinessCard name={biz.name} info={biz.info} canEdit={biz.editable} onEdit={() => setInfoOpen(true)} />}
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
                {future && (
                  <Card>
                    <T size={13} color={colors.info}>
                      İleri tarih: rapor (R), tatil (T) ya da işletme kapalı (K) girilebilir. Birkaç günlük rapor için öğrencinin altındaki "Birkaç günlük rapor" düğmesini kullanın.
                    </T>
                  </Card>
                )}
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
                      <HalfRow key={half} half={half} cell={current(s, half)} base={s[half]} canEdit={s.editable} future={future} onPick={(c) => set(s, half, c)} />
                    ))}
                    {s.editable && (editable(s.am) || editable(s.pm)) && (
                      <Pressable accessibilityRole="button" onPress={() => setReport(s)} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.info }}>+ Birkaç günlük rapor</Text>
                      </Pressable>
                    )}
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
      {d && report && (
        <ReportSheet
          student={report}
          from={d.date}
          onClose={() => setReport(null)}
          onSaved={(msg) => {
            setReport(null);
            done(msg);
          }}
        />
      )}
      {biz && infoOpen && (
        <InfoSheet
          businessId={biz.id}
          name={biz.name}
          info={biz.info}
          onClose={() => setInfoOpen(false)}
          onSaved={() => {
            setInfoOpen(false);
            done('İşletme bilgileri kaydedildi.');
          }}
        />
      )}
    </Screen>
  );
}

function HalfRow({ half, cell, base, canEdit, future, onPick }: { half: Half; cell: Cell; base: Cell; canEdit: boolean; future: boolean; onPick: (c: Code) => void }) {
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
      {/* İleri tarihte devamsızlık (D) girilemez; "İşletmede" yerine "Boş" */}
      {[...CHOICES.filter((c) => !(future && c.code === 'D')).map((c) => (future && c.code === 'X' ? { ...c, label: 'Boş' } : c)), ...extra].map((c) => {
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

/** İşletme bilgileri: yetkili, usta öğretici, telefon (dokununca arar), adres (dokununca harita) */
function BusinessCard({ name, info, canEdit, onEdit }: { name: string; info: BusinessInfo | null; canEdit: boolean; onEdit: () => void }) {
  const rows = INFO_FIELDS.filter((f) => info?.[f.key]);
  const open = (key: keyof BusinessInfo, value: string) => {
    if (key === 'phone') void Linking.openURL(`tel:${value.replace(/[^\d+]/g, '')}`);
    else if (key === 'email') void Linking.openURL(`mailto:${value}`);
    else if (key === 'address') void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${value}`)}`);
  };
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: colors.ink }}>İşletme bilgileri</Text>
        {canEdit && (
          <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={8}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.info }}>{rows.length ? 'Düzenle' : 'Bilgi ekle'}</Text>
          </Pressable>
        )}
      </View>
      {!rows.length ? (
        <T size={13} color={colors.faint}>
          Yetkili, usta öğretici, telefon ve adres henüz girilmemiş.
        </T>
      ) : (
        rows.map((f) => {
          const value = info![f.key]!;
          const link = f.key === 'phone' || f.key === 'email' || f.key === 'address';
          return (
            <Pressable key={f.key} disabled={!link} onPress={() => open(f.key, value)} style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ width: 118, fontSize: 12.5, fontWeight: '600', color: colors.faint }}>{f.label}</Text>
              <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: link ? colors.info : colors.ink }}>{value}</Text>
            </Pressable>
          );
        })
      )}
    </Card>
  );
}

function InfoSheet({ businessId, name, info, onClose, onSaved }: { businessId: string; name: string; info: BusinessInfo | null; onClose: () => void; onSaved: () => void }) {
  const path = useSchoolPath(`internship/businesses/${businessId}/info`);
  const [form, setForm] = useState<Record<keyof BusinessInfo, string>>(() =>
    Object.fromEntries(INFO_FIELDS.map((f) => [f.key, info?.[f.key] ?? ''])) as Record<keyof BusinessInfo, string>,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'PATCH', body: Object.fromEntries(INFO_FIELDS.map((f) => [f.key, form[f.key].trim() || null])) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 10 }}>{name}</Text>
      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
        {INFO_FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            value={form[f.key]}
            onChangeText={(v) => setForm((x) => ({ ...x, [f.key]: v }))}
            multiline={f.multiline}
            keyboardType={f.keyboard}
            autoCapitalize={f.keyboard === 'email-address' ? 'none' : 'sentences'}
          />
        ))}
      </ScrollView>
      {error && (
        <T size={13} color={colors.danger} style={{ marginTop: 8 }}>
          {error}
        </T>
      )}
      <View style={{ marginTop: 12 }}>
        <Button loading={busy} onPress={() => void save()}>
          Kaydet
        </Button>
      </View>
    </Sheet>
  );
}

/** Birkaç günlük rapor: başlangıç günü ve gün sayısı; okul günleri ve tatiller sunucuda atlanır */
function ReportSheet({ student, from, onClose, onSaved }: { student: DayStudent; from: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const path = useSchoolPath('internship/marks');
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const until = addDays(from, days - 1);
  const short = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ changed: number; notified?: number }>(path, {
        method: 'POST',
        body: { date: from, until, items: (['am', 'pm'] as Half[]).map((half) => ({ studentId: student.id, half, code: 'R' })) },
      });
      onSaved(r.notified ? 'Rapor kaydedildi; koordinatör müdür yardımcısına bildirim gönderildi.' : 'Rapor kaydedildi.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{student.fullName} · rapor</Text>
      <T size={12.5} color={colors.faint} style={{ marginTop: 4 }}>
        Raporlu günler tam gün R (özürlü) işaretlenir. Aradaki okul günleri, hafta sonu ve tatiller atlanır.
      </T>
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
        {days === 1 ? short(from) : `${short(from)} – ${short(until)}`}
      </T>
      {error && (
        <T size={13} color={colors.danger} style={{ marginTop: 8 }}>
          {error}
        </T>
      )}
      <View style={{ marginTop: 14 }}>
        <Button loading={busy} onPress={() => void save()}>
          Raporu kaydet
        </Button>
      </View>
    </Sheet>
  );
}
