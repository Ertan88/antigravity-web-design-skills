import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { api } from '../src/api.ts';
import { useSchoolPath } from '../src/auth.tsx';
import { useSchoolQuery } from '../src/data.ts';
import { addDays, HALF_SHORT, HALVES, LegendBand, letter, pickable, prevCode, ReportSheet, TONE, UndoBar, useMarks, type Cell, type Code, type Half } from '../src/intern.tsx';
import { Sheet } from '../src/sheet.tsx';
import { Text } from '../src/text.tsx';
import { colors } from '../src/theme.ts';
import { Button, Card, Chip, Empty, ErrorNote, Field, Loading, Screen, T } from '../src/ui.tsx';

/*
 * İşletme ziyareti (koordinatör öğretmen): o gün işletmedeki öğrencilerin devamı. Her gün iki bölümdür: S (sabah) ve
 * Ö (öğle). Okul günleri (O) ve takvim tatilleri (T) kendiliğinden gelir; öğretmen D, İ, R, H işaretler, işletme kapalıysa
 * K, tatilse T. Dokununca hemen kaydedilir; yanlış işaret "Geri al" ile düzeltilir. Devamsızlık birkaç dakika sonra
 * koordinatör müdür yardımcısına bildirilir.
 */

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

const dayTitle = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

const CODE_TEXT: Record<Code, string> = {
  X: 'işaret silindi',
  D: 'özürsüz devamsız',
  İ: 'izinli',
  R: 'raporlu',
  H: 'hasta sevkli',
  T: 'tatil',
  K: 'işletme kapalı',
};

/** Bir bölümdeki seçenekler: X (işletmede, siler), D, İ, R, H ve K (işletmedeki bütün öğrenciler) */
const ROW_CODES: Code[] = ['X', 'D', 'İ', 'R', 'H', 'K'];

export default function Isletme() {
  const { tarih } = useLocalSearchParams<{ tarih?: string }>();
  const [date, setDate] = useState<string | null>(tarih && /^\d{4}-\d{2}-\d{2}$/.test(tarih) ? tarih : null);
  const day = useSchoolQuery<DayData>(`internship/day${date ? `?date=${date}` : ''}`);
  const d = day.data;
  const marks = useMarks();
  const [bizId, setBizId] = useState<string | null>(null);
  /** İyimser görünüm: kaydedilene ve liste tazelenene kadar seçilen kod */
  const [local, setLocal] = useState<Map<string, Cell>>(new Map());
  const [notice, setNotice] = useState<string | null>(null);
  /** Birkaç günlük rapor girilen öğrenci */
  const [report, setReport] = useState<DayStudent | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    setLocal(new Map());
  }, [d]);
  useEffect(() => {
    setNotice(null);
  }, [d?.date]);
  useEffect(() => {
    if (d && !d.businesses.some((b) => b.id === bizId)) setBizId(d.businesses[0]?.id ?? null);
  }, [d, bizId]);

  const biz = d?.businesses.find((b) => b.id === bizId) ?? null;
  const current = (s: DayStudent, half: Half): Cell => local.get(`${s.id}|${half}`) ?? s[half];

  /** Dokununca kaydet; önceki kod Geri al için saklanır */
  const pick = (s: DayStudent, half: Half, code: Code) => {
    if (!d) return;
    const before = current(s, half);
    if (prevCode(before) === code) return;
    setLocal((m) => new Map(m).set(`${s.id}|${half}`, code === 'X' ? (d.date > d.today ? '' : 'X') : code));
    void marks.save(
      { date: d.date, items: [{ studentId: s.id, half, code }] },
      { label: `${s.fullName}: ${HALF_SHORT[half] === 'S' ? 'sabah' : 'öğle'} · ${CODE_TEXT[code]}`, body: { date: d.date, items: [{ studentId: s.id, half, code: prevCode(before) }] } },
    );
  };
  /** İşletmedeki bütün öğrencilere (K) ya da bütün öğrencilere (T), tam gün */
  const pickAll = (code: 'K' | 'T') => {
    if (!d || !biz) return;
    const s = biz.students.find((x) => x.editable && HALVES.some((h) => pickable(x[h])));
    if (!s) return;
    const halves = HALVES.filter((h) => pickable(s[h]));
    void marks.save(
      { date: d.date, items: halves.map((half) => ({ studentId: s.id, half, code })) },
      { label: code === 'K' ? `${biz.name}: işletme kapalı (K)` : 'Bütün öğrencilere tatil (T)', body: { date: d.date, items: halves.map((half) => ({ studentId: s.id, half, code: 'X' as Code })) } },
    );
  };

  const shown = d?.date ?? date;
  const future = Boolean(d && d.date > d.today);
  const off = d && (d.day.weekday >= 6 || d.day.holiday);

  return (
    <Screen
      title="Ziyaret kaydı"
      subtitle={shown ? `${dayTitle(shown)}${d && d.date === d.today ? ' · bugün' : ''}` : undefined}
      back
      refreshing={day.isRefetching}
      onRefresh={() => void day.refetch()}
      footer={marks.undo ? <UndoBar label={marks.undo.label} onUndo={marks.undoLast} /> : undefined}
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
        <Empty icon="business-outline" title="İşletme yok" text="Koordinatör olduğunuz ya da eklediğiniz işletme yok, ya da işletmeye bağlı öğrenci yok. İşletmeyi yönetim panelinden ekleyebilirsiniz." />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
            {d.businesses.map((b) => (
              <Chip key={b.id} label={`${b.name} · ${b.students.length}`} selected={b.id === bizId} onPress={() => setBizId(b.id)} />
            ))}
          </ScrollView>
          <LegendBand />
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
                <T size={12.5} color={future ? colors.info : colors.muted}>
                  {future
                    ? 'İleri tarih: izin (İ), rapor (R), sevk (H), tatil (T) ya da işletme kapalı (K) girilebilir; D girilemez.'
                    : 'Dokununca kaydedilir. Yanlış işareti "Geri al" ile ya da X ile silin.'}
                </T>
                {biz.editable && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button variant="secondary" size="sm" onPress={() => pickAll('K')} disabled={marks.busy}>
                      İşletme kapalı (K)
                    </Button>
                    <Button variant="secondary" size="sm" onPress={() => pickAll('T')} disabled={marks.busy}>
                      Tatil (T)
                    </Button>
                  </View>
                )}
                {biz.students.map((s) => (
                  <Card key={s.id} style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <T size={12.5} weight="700" color={colors.faint}>
                        {s.schoolNo}
                      </T>
                      <T size={12.5} weight="700" color={colors.muted}>
                        {s.className ?? ''}
                      </T>
                      <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
                        {s.fullName}
                      </Text>
                    </View>
                    {HALVES.map((half) => (
                      <HalfRow key={half} half={half} cell={current(s, half)} base={s[half]} canEdit={s.editable} future={future} onPick={(c) => pick(s, half, c)} />
                    ))}
                    {s.editable && HALVES.some((h) => pickable(s[h])) && (
                      <Pressable accessibilityRole="button" onPress={() => setReport(s)} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.info }}>+ Birkaç günlük rapor / izin</Text>
                      </Pressable>
                    )}
                  </Card>
                ))}
              </>
            )
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
      {d && report && (
        <ReportSheet
          student={report}
          from={d.date}
          onClose={() => setReport(null)}
          onSaved={(msg) => {
            setReport(null);
            setNotice(msg);
            void day.refetch();
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
            setNotice('İşletme bilgileri kaydedildi.');
            void day.refetch();
          }}
        />
      )}
    </Screen>
  );
}

function HalfRow({ half, cell, base, canEdit, future, onPick }: { half: Half; cell: Cell; base: Cell; canEdit: boolean; future: boolean; onPick: (c: Code) => void }) {
  const label = HALF_SHORT[half];
  if (!pickable(base) || !canEdit) {
    const t = TONE[cell];
    const text = cell === 'O' ? 'Okulda' : cell === 'TA' ? 'Tatil' : cell === '' ? '—' : letter(cell);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ width: 18, fontSize: 13, fontWeight: '800', color: colors.faint }}>{label}</Text>
        <View style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: t?.bg ?? colors.primarySoft }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: t?.fg ?? colors.muted }}>{text}</Text>
        </View>
      </View>
    );
  }
  const now: Cell = cell === '' ? 'X' : cell;
  // İleri tarihte D yok; tatil işaretliyse K yerine T görünür
  const codes = ROW_CODES.filter((c) => !(future && c === 'D')).map((c) => (c === 'K' && now === 'T' ? 'T' : c));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Text style={{ width: 18, fontSize: 13, fontWeight: '800', color: colors.faint }}>{label}</Text>
      {codes.map((code) => {
        const on = now === code;
        const t = TONE[code]!;
        return (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label === 'S' ? 'Sabah' : 'Öğle'} ${code}`}
            onPress={() => onPick(code)}
            style={{
              flex: 1,
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
              borderWidth: on ? 2 : 1,
              borderColor: on ? colors.ink : colors.border,
              backgroundColor: on ? t.bg : colors.card,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: on ? t.fg : colors.muted }}>{code === 'X' && future ? '–' : code}</Text>
          </Pressable>
        );
      })}
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

