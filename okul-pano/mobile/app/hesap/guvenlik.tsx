import { errorText } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../src/api.ts';
import { useAuth } from '../../src/auth.tsx';
import { timeAgo } from '../../src/day.ts';
import { SECURITY_KEY, useSecurity } from '../../src/security.ts';
import { colors } from '../../src/theme.ts';
import { Badge, Banner, Button, Card, ErrorNote, ListRow, Loading, Screen, SectionTitle, T, confirm } from '../../src/ui.tsx';

/** Menü › Güvenlik (9B): şifre, iki adımlı doğrulama ve açık oturumlar bir arada */
export default function Guvenlik() {
  const { me } = useAuth();
  const q = useSecurity();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mfa = q.data?.mfa;
  const sessions = q.data?.sessions ?? [];
  const others = sessions.filter((s) => !s.current);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: SECURITY_KEY });
    } catch (err) {
      setMessage(errorText(err, 'İşlem yapılamadı'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen back title="Güvenlik">
      {me?.user.mfaRequired && !me.user.mfaEnabled && (
        <Banner icon="shield-checkmark-outline" tone="warning" title="İki adımlı doğrulama zorunlu" text="Platform hesabında açana kadar platform ekranları kapalı kalır." />
      )}
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        <ListRow tile={{ icon: 'lock-closed-outline', tone: 'lilac' }} title="Şifre" subtitle="Değiştirince diğer cihazlardaki oturumlar kapanır" onPress={() => router.push('/hesap/sifre')} />
        <ListRow
          tile={{ icon: 'shield-checkmark-outline', tone: 'mint' }}
          title="İki adımlı doğrulama"
          subtitle={!mfa ? '…' : mfa.enabled ? `Açık · ${mfa.recoveryLeft} yedek kod` : mfa.required ? 'Kapalı · bu hesapta zorunlu' : 'Kapalı'}
          onPress={() => router.push('/hesap/dogrulama')}
          last
        />
      </Card>

      <View style={{ gap: 6 }}>
        <SectionTitle>Açık oturumlar</SectionTitle>
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorNote error={q.error} />
        ) : (
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {sessions.map((s, i) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.border }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <T weight="700">{s.device}</T>
                    {s.current && <Badge tone="success">Bu cihaz</Badge>}
                  </View>
                  <T size={13} color={colors.muted}>
                    {s.current ? 'Şu an kullanılıyor' : `Son kullanım: ${timeAgo(s.lastUsedAt)}`}
                  </T>
                </View>
                {!s.current && (
                  <Button size="sm" variant="delete" loading={busy === s.id} disabled={Boolean(busy)} onPress={() => void run(s.id, () => api(`/api/me/sessions/${s.id}`, { method: 'DELETE' }))}>
                    Kapat
                  </Button>
                )}
              </View>
            ))}
          </Card>
        )}
        {others.length > 0 && (
          <View style={{ gap: 6, marginTop: 6 }}>
            <Button
              variant="delete"
              loading={busy === 'others'}
              disabled={Boolean(busy)}
              onPress={() =>
                void confirm({ title: 'Diğer cihazlardan çıkılsın mı?', message: 'Bu telefon dışındaki bütün oturumlar kapanır; hatırlanan cihazlar da unutulur.', confirmLabel: 'Çık' }).then(
                  async (ok) => {
                    if (ok) await run('others', () => api('/api/me/sessions/others', { method: 'POST', body: {} }));
                  },
                )
              }
            >
              Diğer bütün cihazlardan çık
            </Button>
            <T size={12} color={colors.muted}>
              Konum ve internet adresi tutulmaz; cihaz adı tarayıcı ya da uygulama bilgisinden çıkarılır.
            </T>
          </View>
        )}
        {message && (
          <T size={13} weight="600" color={colors.danger}>
            {message}
          </T>
        )}
      </View>
    </Screen>
  );
}
