import { SUPPORT_AREAS, SUPPORT_KINDS, type SupportTicket } from '@okulpano/shared/issues';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { absoluteUrl, api } from '../../src/api.ts';
import { useAuth } from '../../src/auth.tsx';
import { StatusPill, ThreadView } from '../../src/issues.tsx';
import { colors } from '../../src/theme.ts';
import { Button, Card, ErrorNote, Field, Loading, Screen, T } from '../../src/ui.tsx';

/** Destek talebi yazışması. ?p=1: platform yöneticisi görünümü (yanıt yazar, çözüldü olarak kapatır) */
export default function Talep() {
  const { id, p } = useLocalSearchParams<{ id: string; p?: string }>();
  const platform = p === '1';
  const { school } = useAuth();
  const path = platform ? `/api/platform/support/${id}` : `/api/schools/${school?.id}/support/${id}`;
  const qc = useQueryClient();
  const key = ['support-ticket', id, platform];
  const q = useQuery({ queryKey: key, queryFn: () => api<SupportTicket>(path), enabled: Boolean(id && (platform || school)), refetchInterval: 30_000 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (tag: string, fn: () => Promise<SupportTicket>) => {
    setBusy(tag);
    setError(null);
    try {
      qc.setQueryData(key, await fn());
      void qc.invalidateQueries({ queryKey: platform ? ['platform-support'] : [school?.id, 'support'] });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem yapılamadı');
      return false;
    } finally {
      setBusy(null);
    }
  };
  const send = async () => {
    if (await run('msg', () => api<SupportTicket>(`${path}/messages`, { method: 'POST', body: { body: text } }))) setText('');
  };

  const t = q.data;
  if (!t) {
    return (
      <Screen back title="Talep">
        <ErrorNote error={q.error} />
        {q.isLoading && <Loading />}
      </Screen>
    );
  }
  const attachments = (t.messages ?? []).filter((m) => m.attachmentUrl);
  return (
    <Screen
      back
      title={t.subject}
      subtitle={`${SUPPORT_KINDS[t.kind]} · ${SUPPORT_AREAS[t.area]}${platform ? ` · ${t.schoolName}` : ''}`}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      footer={
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Field label="Yanıt" value={text} onChangeText={setText} maxLength={2000} multiline placeholder={platform ? 'Okula yanıt yazın' : 'Destek ekibine yazın'} />
          </View>
          <Button icon="send" accessibilityLabel="Gönder" loading={busy === 'msg'} disabled={!text.trim()} onPress={() => void send()} />
        </View>
      }
    >
      <ErrorNote error={q.error} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <T size={12.5} color={colors.muted}>
              {platform ? `${t.schoolName} · ${t.userName}` : `Gönderen: ${t.userName}`}
            </T>
          </View>
          <StatusPill status={t.status} />
        </View>
        {platform && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {t.status !== 'resolved' ? (
              <Button size="sm" icon="checkmark-circle-outline" loading={busy === 'status'} onPress={() => void run('status', () => api<SupportTicket>(path, { method: 'PATCH', body: { status: 'resolved' } }))}>
                Çözüldü olarak kapat
              </Button>
            ) : (
              <Button size="sm" variant="secondary" icon="arrow-undo-outline" loading={busy === 'status'} onPress={() => void run('status', () => api<SupportTicket>(path, { method: 'PATCH', body: { status: 'answered' } }))}>
                Yeniden aç
              </Button>
            )}
          </View>
        )}
        {!platform && t.status === 'resolved' ? (
          <T size={12} color={colors.muted} style={{ marginTop: 8 }}>
            Talep kapatıldı. Yeniden yazarsanız yeniden açılır.
          </T>
        ) : null}
      </Card>
      {error && (
        <T size={13} color={colors.danger} weight="600">
          {error}
        </T>
      )}
      <ThreadView messages={t.messages ?? []} />
      {attachments.map((m) => (
        <Image key={m.id} source={{ uri: absoluteUrl(m.attachmentUrl)! }} style={{ width: '100%', height: 200, borderRadius: 14 }} resizeMode="contain" accessibilityLabel="Ek" />
      ))}
    </Screen>
  );
}
