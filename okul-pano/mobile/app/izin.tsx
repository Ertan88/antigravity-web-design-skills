import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useMeToday, useMyLeaves } from '../src/data.ts';
import { addDays, dayTitle } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Badge, Button, Card, Choice, Empty, Field, Screen, SectionTitle, T } from '../src/ui.tsx';

type Preset = 'today' | 'tomorrow' | 'custom';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

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
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ approvalStatus: string }>(path, { method: 'POST', body: { startDate: r[0], endDate: r[1], note: note.trim() || null } });
      await Promise.all(['me/leaves', 'me/today'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));
      setMessage({ ok: true, text: res.approvalStatus === 'approved' ? 'İzniniz kaydedildi, panoda görünüyor.' : 'İzin bildiriminiz yöneticinin onayına gönderildi.' });
      setNote('');
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Gönderilemedi' });
    } finally {
      setBusy(false);
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
        İzin nedeni yalnızca yöneticiler tarafından görülür, panoda gösterilmez.
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
      <Field label="Not (isteğe bağlı)" value={note} onChangeText={setNote} maxLength={120} placeholder="ör. Yıllık izin, görevlendirme" help="Hastalık, tanı ya da rapor içeriği gibi sağlık bilgisi yazmayın." />

      <SectionTitle>Bildirdiğim izinler</SectionTitle>
      {(mine.data ?? []).length ? (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {mine.data!.slice(0, 10).map((l, i) => (
            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: '#eef2f5' }}>
              <T weight="600" style={{ flex: 1 }}>
                {l.startDate === l.endDate ? dayTitle(l.startDate) : `${dayTitle(l.startDate, { day: 'numeric', month: 'long' })} – ${dayTitle(l.endDate, { day: 'numeric', month: 'long' })}`}
              </T>
              <Badge tone={l.approvalStatus === 'approved' ? 'success' : l.approvalStatus === 'pending' ? 'warning' : 'danger'}>
                {l.approvalStatus === 'approved' ? 'Onaylandı' : l.approvalStatus === 'pending' ? 'Onay bekliyor' : 'Reddedildi'}
              </Badge>
            </View>
          ))}
        </Card>
      ) : (
        <T color={colors.muted}>Henüz izin bildirmediniz.</T>
      )}
    </Screen>
  );
}
