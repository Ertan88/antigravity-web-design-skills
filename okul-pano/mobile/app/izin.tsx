import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useMeToday, useMyLeaves } from '../src/data.ts';
import { addDays, dayTitle } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Badge, Button, Card, Choice, confirm, Empty, Field, Icon, Screen, SectionTitle, T } from '../src/ui.tsx';

type Preset = 'today' | 'tomorrow' | 'custom';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** İzin nedeni (yalnızca yöneticiler görür): kayıtta notun başına yazılır, ör. "Mazeret izni · düğün" */
const KINDS = ['Mazeret izni', 'Görevlendirme', 'Rapor', 'Refakat izni', 'Doğum / babalık izni', 'Evlilik izni', 'Vefat izni', 'Diğer'] as const;
type Kind = (typeof KINDS)[number] | '';
const composeNote = (kind: Kind, detail: string) => [kind, detail.trim()].filter(Boolean).join(' · ') || null;

/** "29.10.2026" ya da "2026-10-29" → ISO tarih */
function parseDate(v: string): string | null {
  const t = v.trim();
  if (ISO.test(t)) return t;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : null;
}

/**
 * İzin bildirimi: öğretmen kendi iznini bildirir. İzin yetkisi yoksa yöneticinin onayına düşer;
 * onaylanınca panoda izinli görünür ve nöbeti boş kaldıysa yöneticiye hatırlatılır.
 */
export default function Izin() {
  const { school, isTeacher, can } = useAuth();
  const qc = useQueryClient();
  const path = useSchoolPath('me/leaves');
  const today = useMeToday();
  const mine = useMyLeaves();
  const base = today.data?.today ?? new Date().toISOString().slice(0, 10);
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

  const submit = async () => {
    const r = range();
    if (!r) return setMessage({ ok: false, text: 'Tarihi GG.AA.YYYY biçiminde yazın (ör. 29.10.2026).' });
    if (!kind) return setMessage({ ok: false, text: 'İzin nedenini seçin.' });
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ approvalStatus: string }>(path, { method: 'POST', body: { startDate: r[0], endDate: r[1], note: composeNote(kind, note) } });
      await Promise.all(['me/leaves', 'me/today'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));
      setMessage({ ok: true, text: res.approvalStatus === 'approved' ? 'İzniniz kaydedildi, panoda görünüyor.' : 'İzin bildiriminiz yöneticinin onayına gönderildi.' });
      setNote('');
      setKind('');
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Gönderilemedi' });
    } finally {
      setBusy(false);
    }
  };

  // Geri alma: onay bekleyen her zaman, diğerleri bitmemişse (geçmiş izinler kayıt olarak kalır)
  const removable = (l: { approvalStatus: string; endDate: string }) => l.approvalStatus === 'pending' || l.endDate >= base;
  const remove = async (l: { id: string; startDate: string; endDate: string; approvalStatus: string }) => {
    const when = l.startDate === l.endDate ? dayTitle(l.startDate) : `${dayTitle(l.startDate, { day: 'numeric', month: 'long' })} – ${dayTitle(l.endDate, { day: 'numeric', month: 'long' })}`;
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

  return (
    <Screen
      back
      title="İzin bildir"
      footer={
        <>
          {message && (
            <T size={13} color={message.ok ? colors.success : colors.danger} weight="600" style={{ textAlign: 'center' }}>
              {message.text}
            </T>
          )}
          <Button size="lg" loading={busy} onPress={() => void submit()}>
            {can('leaves.manage') ? 'Kaydet' : 'Onaya gönder'}
          </Button>
        </>
      }
    >
      <T color={colors.muted} size={14}>
        İzin nedeni yalnızca yöneticiler tarafından görülür, panoda gösterilmez. Henüz bitmemiş izinlerinizi aşağıdaki listeden silebilirsiniz.
      </T>
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
      {preset === 'custom' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Başlangıç" value={start} onChangeText={setStart} placeholder="29.10.2026" keyboardType="numbers-and-punctuation" maxLength={10} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Bitiş (dahil)" value={end} onChangeText={setEnd} placeholder="aynı gün" keyboardType="numbers-and-punctuation" maxLength={10} />
          </View>
        </View>
      ) : (
        <T weight="700">{dayTitle(preset === 'today' ? base : addDays(base, 1))}</T>
      )}
      <SectionTitle>İzin nedeni</SectionTitle>
      <Choice value={kind} onChange={setKind} columns={2} options={KINDS.map((k) => ({ value: k, label: k }))} />
      <Field
        label="Açıklama (isteğe bağlı)"
        value={note}
        onChangeText={setNote}
        maxLength={90}
        placeholder="ör. il millî eğitim toplantısı"
        help="Hastalık, tanı ya da rapor içeriği gibi sağlık bilgisi yazmayın."
      />

      <SectionTitle>Bildirdiğim izinler</SectionTitle>
      {(mine.data ?? []).length ? (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {mine.data!.slice(0, 15).map((l, i) => (
            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
              <View style={{ flex: 1, gap: 3 }}>
                <T weight="700">
                  {l.startDate === l.endDate ? dayTitle(l.startDate) : `${dayTitle(l.startDate, { day: 'numeric', month: 'long' })} – ${dayTitle(l.endDate, { day: 'numeric', month: 'long' })}`}
                </T>
                <T size={13} color={l.note ? colors.muted : colors.subtle}>
                  {l.note ?? 'Neden belirtilmemiş'}
                </T>
                <View style={{ flexDirection: 'row' }}>
                  <Badge tone={l.approvalStatus === 'approved' ? 'success' : l.approvalStatus === 'pending' ? 'warning' : 'danger'}>
                    {l.approvalStatus === 'approved' ? 'Onaylandı' : l.approvalStatus === 'pending' ? 'Onay bekliyor' : 'Reddedildi'}
                  </Badge>
                </View>
              </View>
              {removable(l) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="İzin bildirimini sil"
                  hitSlop={8}
                  onPress={() => void remove(l)}
                  style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.dangerTint, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              )}
            </View>
          ))}
        </Card>
      ) : (
        <T color={colors.muted}>Henüz izin bildirmediniz.</T>
      )}
    </Screen>
  );
}
