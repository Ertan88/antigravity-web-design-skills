import { DESIGN_PALETTES } from '@okulpano/shared/designs';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, Switch, View } from 'react-native';
import { absoluteUrl, api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useAnnouncements, type Announcement } from '../src/data.ts';
import { dayTitle } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Button, Card, Empty, Icon, Loading, Screen, Segmented, T } from '../src/ui.tsx';

type Tab = 'live' | 'planned' | 'ended';

function stateOf(a: Announcement, now: number): Tab | 'pending' {
  if (a.approvalStatus !== 'approved') return 'pending';
  if (a.endsAt && Date.parse(a.endsAt) <= now) return 'ended';
  if (a.startsAt && Date.parse(a.startsAt) > now) return 'planned';
  return 'live';
}

/** Yayın akışı (tasarım 12): panolarda şu an ve planlı olanlar; sıralama ve duraklatma */
export default function YayinAkisi() {
  const { school, can } = useAuth();
  const qc = useQueryClient();
  const path = useSchoolPath('announcements');
  const list = useAnnouncements();
  const [tab, setTab] = useState<Tab>('live');
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();
  const all = list.data ?? [];
  const counts = { live: 0, planned: 0, ended: 0 } as Record<Tab, number>;
  for (const a of all) {
    const s = stateOf(a, now);
    if (s !== 'pending') counts[s]++;
  }
  const rows = all.filter((a) => stateOf(a, now) === tab);
  const editable = can('announcements.manage');
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const refresh = () => Promise.all(['announcements', 'control-center'].map((k) => qc.invalidateQueries({ queryKey: [school?.id, k] })));
  const toggle = async (a: Announcement) => {
    setError(null);
    try {
      await api(`${path}/${a.id}`, { method: 'PATCH', body: { isActive: !a.isActive } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Değiştirilemedi');
    }
  };
  // Panodaki sıra: listedeki sıra (yukarı / aşağı taşıyınca bütün liste yeniden numaralanır)
  const move = async (index: number, dir: -1 | 1) => {
    const ids = all.map((a) => a.id);
    const id = rows[index]!.id;
    const swapWith = rows[index + dir]?.id;
    if (!swapWith) return;
    const i = ids.indexOf(id);
    const j = ids.indexOf(swapWith);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    setError(null);
    try {
      await api(`${path}/reorder`, { method: 'POST', body: { ids } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sıralanamadı');
    }
  };

  return (
    <Screen back title="Yayın akışı" subtitle="Panolarda şu an ve bugün gösterilenler" refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'live', label: `Yayında ${counts.live}` },
          { value: 'planned', label: `Planlı ${counts.planned}` },
          { value: 'ended', label: 'Bitti' },
        ]}
      />
      {error && <T color={colors.danger}>{error}</T>}
      {list.isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <Card>
          <Empty icon="albums-outline" title={tab === 'live' ? 'Yayında içerik yok' : tab === 'planned' ? 'Planlı içerik yok' : 'Biten içerik yok'} />
        </Card>
      ) : (
        <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          {rows.map((a, i) => {
            const endsToday = a.endsAt && Date.parse(a.endsAt) <= endOfToday.getTime() && tab === 'live';
            return (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                {editable && tab === 'live' && (
                  <View style={{ gap: 2 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Yukarı taşı" disabled={i === 0} onPress={() => void move(i, -1)} style={{ padding: 4, opacity: i === 0 ? 0.25 : 1 }}>
                      <Icon name="chevron-up" size={18} color={colors.muted} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Aşağı taşı"
                      disabled={i === rows.length - 1}
                      onPress={() => void move(i, 1)}
                      style={{ padding: 4, opacity: i === rows.length - 1 ? 0.25 : 1 }}
                    >
                      <Icon name="chevron-down" size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                )}
                <Thumb a={a} />
                <View style={{ flex: 1, minWidth: 0, opacity: a.isActive ? 1 : 0.55 }}>
                  <T weight="700" lines={2}>
                    {a.title}
                  </T>
                  <T size={12} color={endsToday ? colors.warning : colors.muted} weight={endsToday ? '600' : '400'}>
                    {!a.isActive
                      ? 'Duraklatıldı'
                      : endsToday
                        ? 'Bugün sona eriyor'
                        : tab === 'planned' && a.startsAt
                          ? `${dayTitle(a.startsAt.slice(0, 10), { day: 'numeric', month: 'long' })} başlıyor`
                          : a.endsAt
                            ? `${dayTitle(a.endsAt.slice(0, 10), { day: 'numeric', month: 'long' })}'e kadar`
                            : 'Süresiz'}
                    {a.schedule?.phase === 'break' ? ' · teneffüslerde' : ''}
                  </T>
                </View>
                {editable && tab !== 'ended' && (
                  <Switch value={a.isActive} onValueChange={() => void toggle(a)} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor="#fff" accessibilityLabel={`${a.title} yayında`} />
                )}
              </View>
            );
          })}
        </Card>
      )}
      {editable && (
        <Button icon="add" variant="secondary" onPress={() => router.push('/duyuru-yeni')}>
          Duyuru ekle
        </Button>
      )}
      <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
        Okun yönleriyle sırayı değiştirin, anahtarla duraklatın. Kayan yazı ve tasarım ayrıntıları yönetim panelindedir.
      </T>
    </Screen>
  );
}

function Thumb({ a }: { a: Announcement }) {
  const bg = a.design ? (DESIGN_PALETTES[a.design.palette]?.from ?? '#0d4f66') : '#0d4f66';
  return (
    <View style={{ width: 56, height: 36, borderRadius: 6, backgroundColor: bg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {a.kind === 'image' && a.imageUrl ? (
        <Image source={{ uri: absoluteUrl(a.imageUrl)! }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <Icon name={a.kind === 'video' ? 'play' : 'megaphone-outline'} size={16} color="#fff" />
      )}
    </View>
  );
}
