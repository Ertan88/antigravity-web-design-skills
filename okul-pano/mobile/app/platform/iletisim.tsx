import { errorText } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { api } from '../../src/api.ts';
import { useContactRequests, type ContactRequest } from '../../src/platform.tsx';
import { Text } from '../../src/text.tsx';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, confirm, DeleteIconButton, Empty, ErrorNote, Loading, Screen, Segmented, T } from '../../src/ui.tsx';

/*
 * Platform yöneticisi: tanıtım sitesinin iletişim formundan gelen talepler (webdeki sayfanın mobil hâli). Telefon ve
 * e-postaya tek dokunuşla ulaşılır; "Yanıtlandı" geri alınabilir, silme onay penceresiyle. Yanıtlananlar 1 yıl,
 * yanıtlanmayanlar 2 yıl sonra kendiliğinden silinir (KVKK).
 */

const TOPIC: Record<ContactRequest['topic'], { label: string; tone: 'primary' | 'warning' | 'muted' }> = {
  demo: { label: 'Tanıtım isteği', tone: 'primary' },
  quote: { label: 'Fiyat teklifi', tone: 'warning' },
  question: { label: 'Soru', tone: 'muted' },
};

const when = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export default function IletisimTalepleri() {
  const qc = useQueryClient();
  const q = useContactRequests();
  const [filter, setFilter] = useState<'new' | 'done' | 'all'>('new');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const all = q.data ?? [];
  const fresh = all.filter((r) => r.status === 'new').length;
  const rows = all.filter((r) => filter === 'all' || r.status === filter);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['platform', 'contact'] });
    } catch (e) {
      setError(errorText(e, 'Kaydedilemedi'));
    } finally {
      setBusy(null);
    }
  };
  const setStatus = (r: ContactRequest, status: ContactRequest['status']) => run(r.id, () => api(`/api/platform/contact/${r.id}`, { method: 'PATCH', body: { status } }));
  const remove = async (r: ContactRequest) => {
    if (!(await confirm({ title: 'Talep silinsin mi?', message: `${r.name} · ${r.school}. Silinen talep geri getirilemez.`, confirmLabel: 'Sil', tone: 'danger' }))) return;
    await run(r.id, () => api(`/api/platform/contact/${r.id}`, { method: 'DELETE' }));
  };

  return (
    <Screen back title="İletişim talepleri" subtitle="Tanıtım sitesinden gelenler" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <ErrorNote error={q.error} />
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'new', label: `Yeni (${fresh})` },
          { value: 'done', label: 'Yanıtlandı' },
          { value: 'all', label: 'Tümü' },
        ]}
      />
      {error && (
        <T size={13} color={colors.danger}>
          {error}
        </T>
      )}
      {q.isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <Empty icon="mail-open-outline" title={filter === 'new' ? 'Yeni talep yok' : 'Talep yok'} />
      ) : (
        rows.map((r) => (
          <Card key={r.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Badge tone={TOPIC[r.topic].tone}>{TOPIC[r.topic].label}</Badge>
              {r.status === 'done' && <Badge tone="success">Yanıtlandı</Badge>}
              <Text style={{ marginLeft: 'auto', fontSize: 12, fontWeight: '600', color: colors.faint }}>{when(r.createdAt)}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.ink }}>{r.school}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted }}>
                {r.name} · {r.role} · {r.city}
              </Text>
              {r.preferredTime && <Text style={{ fontSize: 12.5, color: colors.muted }}>Uygun zaman: {r.preferredTime}</Text>}
            </View>
            <T size={14}>{r.message}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {r.phone && (
                <Button size="sm" variant="secondary" icon="phone-portrait-outline" onPress={() => void Linking.openURL(`tel:${r.phone!.replace(/[^\d+]/g, '')}`)}>
                  Ara
                </Button>
              )}
              <Button size="sm" variant="secondary" icon="mail-outline" onPress={() => void Linking.openURL(`mailto:${r.email}`)}>
                E-posta
              </Button>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {r.status === 'new' ? (
                <Button size="sm" icon="checkmark" loading={busy === r.id} onPress={() => void setStatus(r, 'done')} style={{ flex: 1 }}>
                  Yanıtlandı
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon="arrow-undo-outline" loading={busy === r.id} onPress={() => void setStatus(r, 'new')} style={{ flex: 1 }}>
                  Yeniye al
                </Button>
              )}
              <DeleteIconButton label="Talebi sil" disabled={busy === r.id} onPress={() => void remove(r)} />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
