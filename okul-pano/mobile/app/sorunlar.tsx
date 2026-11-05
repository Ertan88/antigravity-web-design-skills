import { ISSUE_CATEGORIES, type SchoolIssue } from '@okulpano/shared/issues';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { CATEGORY_LOOK, StatusPill, tileOf, timeText } from '../src/issues.tsx';
import { Text } from '../src/text.tsx';
import { colors } from '../src/theme.ts';
import { Button, Empty, ErrorNote, Icon, Loading, Screen, Segmented } from '../src/ui.tsx';

/**
 * Okul sorunları. Öğretmen: kendi bildirimleri ve durumları. İdare (müdür, yöneticiler): okulun bütün bildirimleri
 * Yeni / İşlemde / Çözüldü sekmelerinde. Bildirime dokununca yazışma ve durum açılır.
 */
export default function Sorunlar() {
  const { school, role } = useAuth();
  const manager = role === 'owner' || role === 'admin';
  const path = useSchoolPath('issues');
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [tab, setTab] = useState<'new' | 'in_progress' | 'resolved'>('new');
  const q = useQuery({ queryKey: [school?.id, 'issues', manager], queryFn: () => api<SchoolIssue[]>(`${path}?scope=${manager ? 'all' : 'mine'}`), enabled: Boolean(school), refetchInterval: 60_000 });
  // Bildirimden gelindiyse doğrudan o bildirim açılır
  useEffect(() => {
    if (id) router.push(`/sorun/${id}`);
  }, [id]);
  const all = q.data ?? [];
  const rows = manager ? all.filter((r) => r.status === tab) : all;
  const count = (s: string) => all.filter((r) => r.status === s).length;
  return (
    <Screen
      back
      title={manager ? 'Okul sorunları' : 'Bildirimlerim'}
      subtitle={manager ? 'Öğretmenlerin bildirdiği sorunlar' : 'Gönderdiğiniz sorunlar'}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      footer={
        <Button icon="send" onPress={() => router.push('/sorun-bildir')}>
          {manager ? 'Sorun bildir' : 'Yeni sorun bildir'}
        </Button>
      }
    >
      <ErrorNote error={q.error} />
      {manager && (
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'new', label: `Yeni (${count('new')})` },
            { value: 'in_progress', label: `İşlemde (${count('in_progress')})` },
            { value: 'resolved', label: 'Çözüldü' },
          ]}
        />
      )}
      {q.isLoading ? (
        <Loading />
      ) : rows.length ? (
        rows.map((r) => <IssueRow key={r.id} issue={r} showStatus={!manager} />)
      ) : (
        <Empty icon="clipboard-check" title={manager ? 'Bu sekmede bildirim yok' : 'Henüz bildiriminiz yok'} text={manager ? undefined : 'Okulda bir sorun görürseniz “Yeni sorun bildir” ile idareye iletin.'} />
      )}
    </Screen>
  );
}

function IssueRow({ issue: r, showStatus }: { issue: SchoolIssue; showStatus: boolean }) {
  const t = tileOf(r.category);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/sorun/${r.id}`)}
      style={({ pressed }) => ({
        backgroundColor: colors.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: r.urgent && r.status !== 'resolved' ? colors.dangerBorder : colors.border,
        padding: 12,
        gap: 8,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={CATEGORY_LOOK[r.category].icon} size={20} color={t.fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
            {ISSUE_CATEGORIES[r.category]} · {r.location}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
            {r.mine ? '' : `${r.reporterName} · `}
            {timeText(r.createdAt)}
            {r.assigneeName ? ` · ${r.assigneeName}` : ''}
          </Text>
        </View>
        {r.urgent && r.status !== 'resolved' ? (
          <View style={{ backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#fff' }}>ACİL</Text>
          </View>
        ) : null}
        {showStatus && <StatusPill status={r.status} />}
      </View>
      {r.lastMessage ? (
        <View style={{ backgroundColor: colors.primarySoft, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 }}>
          <Text style={{ fontSize: 12, color: colors.ink }} numberOfLines={2}>
            {r.lastMessage}
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 13, color: colors.muted }} numberOfLines={2}>
          {r.description}
        </Text>
      )}
    </Pressable>
  );
}
