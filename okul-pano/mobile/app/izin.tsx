import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useMeToday, useMyLeaves, type Leave } from '../src/data.ts';
import { addDays, dayTitle } from '../src/day.ts';
import { Text } from '../src/text.tsx';
import { colors, tiles, type TileTone } from '../src/theme.ts';
import { Badge, Button, Card, Choice, confirm, Empty, Field, Icon, Screen, T } from '../src/ui.tsx';

type Preset = 'today' | 'tomorrow' | 'custom';
type Tab = 'new' | 'list';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** İzin nedeni (yalnızca yöneticiler görür): kayıtta notun başına yazılır, ör. "Mazeret izni · düğün" */
const KINDS = [
  { value: 'Mazeret izni', emoji: '🙋', tone: 'peach' },
  { value: 'Görevlendirme', emoji: '🧳', tone: 'sky' },
  { value: 'Rapor', emoji: '🩺', tone: 'rose' },
  { value: 'Refakat izni', emoji: '🤝', tone: 'mint' },
  { value: 'Doğum / babalık izni', emoji: '👶', tone: 'sun' },
  { value: 'Evlilik izni', emoji: '💍', tone: 'lilac' },
  { value: 'Vefat izni', emoji: '🕊️', tone: 'paper' },
  { value: 'Diğer', emoji: '✳️', tone: 'paper' },
] as const satisfies readonly { value: string; emoji: string; tone: TileTone }[];
type Kind = (typeof KINDS)[number]['value'] | '';
const composeNote = (kind: Kind, detail: string) => [kind, detail.trim()].filter(Boolean).join(' · ') || null;
/** Kayıtlı notun başındaki nedenin simgesi (eski ya da serbest notlarda "Diğer") */
const kindOf = (note: string | null) => KINDS.find((k) => note?.startsWith(k.value)) ?? KINDS[KINDS.length - 1]!;

/** "29.10.2026" ya da "2026-10-29" → ISO tarih */
function parseDate(v: string): string | null {
  const t = v.trim();
  if (ISO.test(t)) return t;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : null;
}
const dayCount = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000) + 1;
const short = (iso: string) => dayTitle(iso, { day: 'numeric', month: 'long' });
/** "Perşembe, 5 Kasım" ya da "16 – 18 Kasım" (ay değişirse "30 Ekim – 2 Kasım") */
function rangeText(a: string, b: string): string {
  if (a === b) return `${dayTitle(a, { weekday: 'long' })}, ${short(a)}`;
  return a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))} – ${short(b)}` : `${short(a)} – ${short(b)}`;
}

/**
 * İzin bildirimi: öğretmen kendi iznini bildirir. İzin yetkisi yoksa yöneticinin onayına düşer;
 * onaylanınca panoda izinli görünür ve nöbeti boş kaldıysa yöneticiye hatırlatılır.
 * Üstte iki sekme: adım adım yeni bildirim ve bildirilen izinler (yaklaşan / geçmiş).
 */
export default function Izin() {
  const { school, isTeacher, can } = useAuth();
  const qc = useQueryClient();
  const path = useSchoolPath('me/leaves');
  const today = useMeToday();
  const mine = useMyLeaves();
  const base = today.data?.today ?? new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<Tab>('new');
  const [preset, setPreset] = useState<Preset>('tomorrow');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [kind, setKind] = useState<Kind>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const range = (): [string, string] | null => {
    if (preset === 'today') return [base, base];
    if (preset === 'tomorrow') return [addDays(base, 1), addDays(base, 1)];
    const s = parseDate(start);
    const e = parseDate(end || start);
    return s && e ? [s, e] : null;
  };
  const r = range();
  const valid = r && r[1] >= r[0] ? r : null;

  const submit = async () => {
    if (!r) return setMessage({ ok: false, text: 'Tarihi GG.AA.YYYY biçiminde yazın (ör. 29.10.2026).' });
    if (!valid) return setMessage({ ok: false, text: 'Bitiş tarihi başlangıçtan önce olamaz.' });
    if (!kind) return setMessage({ ok: false, text: 'İzin nedenini seçin.' });
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ approvalStatus: string }>(path, { method: 'POST', body: { startDate: valid[0], endDate: valid[1], note: composeNote(kind, note) } });
      await Promise.all(['me/leaves', 'me/today'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));
      setMessage({ ok: true, text: res.approvalStatus === 'approved' ? 'İzniniz kaydedildi, panoda görünüyor.' : 'İzin bildiriminiz yöneticinin onayına gönderildi.' });
      setNote('');
      setKind('');
      setTab('list');
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Gönderilemedi' });
    } finally {
      setBusy(false);
    }
  };

  // Geri alma: onay bekleyen her zaman, diğerleri bitmemişse (geçmiş izinler kayıt olarak kalır)
  const removable = (l: Leave) => l.approvalStatus === 'pending' || l.endDate >= base;
  const remove = async (l: Leave) => {
    const when = rangeText(l.startDate, l.endDate);
    const ok = await confirm(
      'İzin bildirimi silinsin mi?',
      l.approvalStatus === 'approved' ? `${when} izniniz geri alınır; panodan kalkar ve yöneticiye bildirilir.` : `${when} izin bildiriminiz geri alınır.`,
      'Sil',
    );
    if (!ok) return;
    try {
      await api(`${path}/${l.id}`, { method: 'DELETE' });
      await Promise.all(['me/leaves', 'me/today'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));
      setMessage({ ok: true, text: 'İzin bildirimi silindi.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Silinemedi' });
    }
  };

  if (!isTeacher) {
    return (
      <Screen back title="İzin bildir">
        <Card>
          <Empty icon="person-outline" title="Hesabınız öğretmen kaydına bağlı değil" text="Okul yöneticiniz panelde Kullanıcılar sayfasından hesabınızı öğretmen kaydınızla eşleştirmeli." />
        </Card>
      </Screen>
    );
  }

  const leaves = mine.data ?? [];
  const msg = message && (
    <T size={13} color={message.ok ? colors.success : colors.danger} weight="600" style={{ textAlign: 'center' }}>
      {message.ok ? '✓ ' : ''}
      {message.text}
    </T>
  );

  return (
    <Screen
      back
      title="İzin bildir"
      footer={
        tab === 'new' ? (
          <>
            {valid && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.muted }}>
                  {rangeText(valid[0], valid[1])}
                  {kind ? (
                    <Text style={{ fontWeight: '800', color: colors.ink }}> · {kind}</Text>
                  ) : (
                    <Text style={{ color: colors.subtle }}> · neden seçilmedi</Text>
                  )}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted }}>{dayCount(valid[0], valid[1])} gün</Text>
              </View>
            )}
            {msg}
            <Button size="lg" loading={busy} onPress={() => void submit()}>
              {can('leaves.manage') ? 'Kaydet' : 'Onaya gönder'}
            </Button>
          </>
        ) : undefined
      }
    >
      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          setMessage(null);
        }}
        items={[
          { value: 'new', label: 'Yeni bildirim' },
          { value: 'list', label: leaves.length ? `İzinlerim (${leaves.length})` : 'İzinlerim' },
        ]}
      />

      {tab === 'new' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: tiles.sky.bg, backgroundColor: colors.infoSoft }}>
            <Text style={{ fontSize: 14 }}>🔒</Text>
            <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '500', color: colors.info }}>
              İzin nedenini yalnızca yöneticiler görür, panoda gösterilmez. Bitmemiş izinlerinizi İzinlerim sekmesinden silebilirsiniz.
            </Text>
          </View>

          <Step no={1} done={Boolean(valid)} title="Ne zaman?">
            <Choice
              value={preset}
              onChange={setPreset}
              columns={3}
              options={[
                { value: 'today', label: 'Bugün' },
                { value: 'tomorrow', label: 'Yarın' },
                { value: 'custom', label: 'Tarih seç' },
              ]}
            />
            {preset === 'custom' && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Başlangıç" value={start} onChangeText={setStart} placeholder="29.10.2026" keyboardType="numbers-and-punctuation" maxLength={10} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Bitiş (dahil)" value={end} onChangeText={setEnd} placeholder="aynı gün" keyboardType="numbers-and-punctuation" maxLength={10} />
                </View>
              </View>
            )}
            {valid && (
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
                📅 {rangeText(valid[0], valid[1])}
                {valid[0] !== valid[1] ? ` · ${dayCount(valid[0], valid[1])} gün` : ''}
              </Text>
            )}
          </Step>

          <Step no={2} done={Boolean(kind)} title="İzin nedeni">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {KINDS.map((k) => {
                const on = kind === k.value;
                return (
                  <Pressable
                    key={k.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={k.value}
                    onPress={() => setKind(on ? '' : k.value)}
                    style={{
                      flexBasis: '47%',
                      flexGrow: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 9,
                      padding: on ? 8 : 9,
                      borderRadius: 15,
                      borderWidth: on ? 2 : 1,
                      borderColor: on ? colors.ink : colors.border,
                      backgroundColor: colors.card,
                    }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: tiles[k.tone].bg, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16 }}>{k.emoji}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink }}>{k.value}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Step>

          <Step no={3} done={Boolean(note.trim())} title="Açıklama" hint="(isteğe bağlı)">
            <Field
              label="Kısa açıklama"
              value={note}
              onChangeText={setNote}
              maxLength={90}
              placeholder="ör. il millî eğitim toplantısı"
              help="⚠️ Hastalık, tanı ya da rapor içeriği gibi sağlık bilgisi yazmayın."
            />
          </Step>
        </>
      ) : (
        <LeaveList leaves={leaves} base={base} removable={removable} onRemove={(l) => void remove(l)} message={msg} onNew={() => setTab('new')} />
      )}
    </Screen>
  );
}

/** Üstte iki sekme (yumuşak zemin, seçili sekme beyaz) */
function Tabs<V extends string>({ value, onChange, items }: { value: V; onChange: (v: V) => void; items: { value: V; label: string }[] }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.primarySoft, borderRadius: 16, padding: 4 }}>
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable
            key={it.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(it.value)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: on ? colors.card : 'transparent' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: on ? colors.ink : colors.faint }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Numaralı adım kartı: tamamlanınca numara yeşile döner */
function Step({ no, done, title, hint, children }: { no: number; done: boolean; title: string; hint?: string; children: ReactNode }) {
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: done ? colors.success : colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: done ? '#ffffff' : colors.onPrimary }}>{no}</Text>
        </View>
        <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.ink }}>{title}</Text>
        {hint && <Text style={{ fontSize: 13, fontWeight: '600', color: colors.faint }}>{hint}</Text>}
      </View>
      {children}
    </Card>
  );
}

const STATUS = {
  pending: { label: 'Onay bekliyor', tone: 'warning', bg: 'warningSoft', fg: 'warning' },
  approved: { label: 'Onaylandı', tone: 'success', bg: 'successSoft', fg: 'success' },
  rejected: { label: 'Reddedildi', tone: 'danger', bg: 'dangerSoft', fg: 'danger' },
} as const;
const statusOf = (s: string) => STATUS[(s in STATUS ? s : 'pending') as keyof typeof STATUS];

/** İzinlerim: durum özeti, yaklaşan ve geçmiş izinler */
function LeaveList({
  leaves,
  base,
  removable,
  onRemove,
  message,
  onNew,
}: {
  leaves: Leave[];
  base: string;
  removable: (l: Leave) => boolean;
  onRemove: (l: Leave) => void;
  message: ReactNode;
  onNew: () => void;
}) {
  if (!leaves.length)
    return (
      <>
        {message}
        <Card>
          <Empty icon="calendar-outline" title="Henüz izin bildirmediniz" />
          <Button variant="secondary" onPress={onNew}>
            Yeni bildirim
          </Button>
        </Card>
      </>
    );
  const upcoming = leaves.filter((l) => l.endDate >= base).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = leaves.filter((l) => l.endDate < base).slice(0, 15);
  const count = (s: keyof typeof STATUS) => leaves.filter((l) => l.approvalStatus === s).length;
  return (
    <>
      {message}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => (
          <View key={s} style={{ flex: 1, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 13, backgroundColor: colors[STATUS[s].bg] }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors[STATUS[s].fg], lineHeight: 30 }}>{count(s)}</Text>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors[STATUS[s].fg] }}>{STATUS[s].label}</Text>
          </View>
        ))}
      </View>
      {upcoming.length > 0 && <Group title="Yaklaşan" items={upcoming} removable={removable} onRemove={onRemove} />}
      {past.length > 0 && <Group title="Geçmiş" items={past} removable={removable} onRemove={onRemove} faded />}
      <T size={12} color={colors.faint} style={{ textAlign: 'center' }}>
        Bitmemiş izinler 🗑️ ile silinebilir; onaylı izin silinirse yöneticiye bildirilir.
      </T>
    </>
  );
}

function Group({ title, items, removable, onRemove, faded }: { title: string; items: Leave[]; removable: (l: Leave) => boolean; onRemove: (l: Leave) => void; faded?: boolean }) {
  return (
    <>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 4 }} accessibilityRole="header">
        {title}
      </Text>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden', opacity: faded ? 0.85 : 1 }}>
        {items.map((l, i) => {
          const k = kindOf(l.note);
          const st = statusOf(l.approvalStatus);
          const n = dayCount(l.startDate, l.endDate);
          return (
            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
              <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: tiles[k.tone].bg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 17 }}>{k.emoji}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: colors.ink }}>
                  {rangeText(l.startDate, l.endDate)}
                  {n > 1 ? ` · ${n} gün` : ''}
                </Text>
                <Text style={{ fontSize: 12.5, color: l.note ? colors.muted : colors.subtle }}>{l.note ?? 'Neden belirtilmemiş'}</Text>
                <View style={{ flexDirection: 'row', marginTop: 3 }}>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </View>
              </View>
              {removable(l) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="İzin bildirimini sil"
                  hitSlop={8}
                  onPress={() => onRemove(l)}
                  style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.dangerTint, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              )}
            </View>
          );
        })}
      </Card>
    </>
  );
}
