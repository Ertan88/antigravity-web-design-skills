import { ISSUE_CATEGORIES, type SchoolIssue } from '@okulpano/shared/issues';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { absoluteUrl, api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { CATEGORY_LOOK, StatusPill, ThreadView, tileOf, timeText } from '../../src/issues.tsx';
import { Text } from '../../src/text.tsx';
import { colors } from '../../src/theme.ts';
import { Button, Card, Chip, ErrorNote, Field, Icon, Loading, Screen, T } from '../../src/ui.tsx';

/** Sorun ayrıntısı: fotoğraf, durum, yazışma; idareci durumu ve sorumluyu değiştirir */
export default function SorunDetay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { school, role } = useAuth();
  const manager = role === 'owner' || role === 'admin';
  const path = useSchoolPath(`issues/${id}`);
  const managersPath = useSchoolPath('issues/managers');
  const qc = useQueryClient();
  const key = [school?.id, 'issue', id];
  const q = useQuery({ queryKey: key, queryFn: () => api<SchoolIssue>(path), enabled: Boolean(school && id), refetchInterval: 30_000 });
  const managers = useQuery({ queryKey: [school?.id, 'issue-managers'], queryFn: () => api<{ id: string; fullName: string }[]>(managersPath), enabled: Boolean(school) && manager });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (tag: string, fn: () => Promise<SchoolIssue>) => {
    setBusy(tag);
    setError(null);
    try {
      qc.setQueryData(key, await fn());
      void qc.invalidateQueries({ queryKey: [school?.id, 'issues'] });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem yapılamadı');
      return false;
    } finally {
      setBusy(null);
    }
  };
  const patch = (tag: string, body: object) => run(tag, () => api<SchoolIssue>(path, { method: 'PATCH', body }));
  const send = async () => {
    if (await run('msg', () => api<SchoolIssue>(`${path}/messages`, { method: 'POST', body: { body: text } }))) setText('');
  };

  const r = q.data;
  if (!r) {
    return (
      <Screen back title="Sorun">
        <ErrorNote error={q.error} />
        {q.isLoading && <Loading />}
      </Screen>
    );
  }
  const t = tileOf(r.category);
  return (
    <Screen
      back
      title={ISSUE_CATEGORIES[r.category]}
      subtitle={r.location}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      footer={
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Field label="Yanıt" value={text} onChangeText={setText} maxLength={2000} multiline placeholder={manager && !r.mine ? 'Öğretmene yanıt yazın' : 'İdareye yazın'} />
          </View>
          <Button icon="send" accessibilityLabel="Gönder" loading={busy === 'msg'} disabled={!text.trim()} onPress={() => void send()} />
        </View>
      }
    >
      <ErrorNote error={q.error} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={CATEGORY_LOOK[r.category].icon} size={22} color={t.fg} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={15} weight="800">
              {r.location}
            </T>
            <T size={12} color={colors.muted}>
              {r.reporterName} · {timeText(r.createdAt)}
            </T>
          </View>
          {r.urgent && r.status !== 'resolved' ? (
            <View style={{ backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#fff' }}>ACİL</Text>
            </View>
          ) : null}
          <StatusPill status={r.status} />
        </View>
        <T size={14} style={{ marginTop: 10, lineHeight: 20 }}>
          {r.description}
        </T>
        {r.photoUrl ? <Image source={{ uri: absoluteUrl(r.photoUrl)! }} style={{ width: '100%', height: 200, borderRadius: 14, marginTop: 10 }} resizeMode="cover" accessibilityLabel="Sorunun fotoğrafı" /> : null}
        {!manager && r.assigneeName ? (
          <T size={12.5} color={colors.muted} style={{ marginTop: 8 }}>
            Sorumlu: {r.assigneeName}
          </T>
        ) : null}
      </Card>

      {manager && (
        <Card>
          <T size={12} weight="800" color={colors.muted}>
            DURUM
          </T>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {r.status === 'new' && (
              <Button size="sm" icon="play" loading={busy === 'in_progress'} onPress={() => void patch('in_progress', { status: 'in_progress' })}>
                İşleme al
              </Button>
            )}
            {r.status !== 'resolved' ? (
              <Button size="sm" variant={r.status === 'new' ? 'secondary' : 'primary'} icon="checkmark-circle-outline" loading={busy === 'resolved'} onPress={() => void patch('resolved', { status: 'resolved' })}>
                Çözüldü
              </Button>
            ) : (
              <Button size="sm" variant="secondary" icon="arrow-undo-outline" loading={busy === 'new'} onPress={() => void patch('new', { status: 'in_progress' })}>
                Yeniden aç
              </Button>
            )}
          </View>
          <T size={12} weight="800" color={colors.muted} style={{ marginTop: 14 }}>
            SORUMLU
          </T>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Chip label="Atanmadı" selected={!r.assigneeUserId} onPress={() => void patch('assignee', { assigneeUserId: null })} />
            {(managers.data ?? []).map((m) => (
              <Chip key={m.id} label={m.fullName} selected={r.assigneeUserId === m.id} onPress={() => void patch('assignee', { assigneeUserId: m.id })} />
            ))}
          </View>
        </Card>
      )}

      {error && (
        <T size={13} color={colors.danger} weight="600">
          {error}
        </T>
      )}
      <T size={12} weight="800" color={colors.muted}>
        YAZIŞMA
      </T>
      {r.messages?.length ? <ThreadView messages={r.messages} /> : <T color={colors.muted}>Henüz yazışma yok.</T>}
    </Screen>
  );
}
