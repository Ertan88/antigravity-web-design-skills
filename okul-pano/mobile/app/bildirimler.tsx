import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useInbox, useInboxActions, type InboxItem } from '../src/data.ts';
import { timeAgo } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Badge, Button, Card, Empty, Icon, ListRow, Loading, Screen, Segmented, type IconName } from '../src/ui.tsx';

/** Paneldeki adresleri uygulamadaki ekranlara çevirir */
const ROUTES: Record<string, string> = {
  approval: '/onaylar',
  'leave-request': '/onaylar',
  returned: '/duyurular',
  approved: '/duyurular',
  'duty-gap': '/nobet',
  'month-student': '/duyuru-yeni',
};
const ICONS: Record<string, { icon: IconName; tone: 'primary' | 'warning' | 'danger' | 'gold' | 'muted' }> = {
  approval: { icon: 'checkmark-done-outline', tone: 'primary' },
  'leave-request': { icon: 'calendar-outline', tone: 'primary' },
  returned: { icon: 'arrow-undo-outline', tone: 'danger' },
  approved: { icon: 'checkmark-circle-outline', tone: 'primary' },
  'duty-gap': { icon: 'shield-checkmark-outline', tone: 'warning' },
  'month-student': { icon: 'star-outline', tone: 'gold' },
  'bridge-day': { icon: 'calendar-outline', tone: 'warning' },
};
const FALLBACK = { icon: 'notifications-outline' as IconName, tone: 'muted' as const };

/**
 * Bildirimler: yeni olanlar ve okunanlar dahil geçmiş (panelle aynı kutu). Dokununca okundu sayılır ve ilgili
 * ekran açılır; zarf simgesi okundu / okunmadı yapar.
 */
export default function Bildirimler() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const inbox = useInbox(filter);
  const { read, unread, readAll } = useInboxActions();
  const list = inbox.data?.items ?? [];
  const unreadCount = inbox.data?.unread ?? 0;

  const open = (n: InboxItem) => {
    if (!n.readAt) read.mutate({ ids: [n.id] });
    const to = ROUTES[n.kind];
    if (to) router.push(to as never);
  };

  return (
    <Screen back title="Bildirimler" refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()}>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Tümü' },
          { value: 'unread', label: unreadCount ? `Okunmamış (${unreadCount})` : 'Okunmamış' },
        ]}
      />
      {unreadCount > 0 && <Button variant="secondary" size="sm" icon="checkmark-done-outline" onPress={readAll}>
          Tümünü okundu say
        </Button>}
      {inbox.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <Card>
          <Empty
            icon="notifications-outline"
            title={filter === 'unread' ? 'Okunmamış bildirim yok' : 'Henüz bildirim yok'}
            text="Onay bekleyen duyurular, düzeltme istekleri ve boş nöbetler burada birikir; okuduklarınız da saklanır."
          />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {list.map((n, i) => {
            const style = ICONS[n.kind] ?? FALLBACK;
            const isNew = !n.readAt;
            return (
              <View key={n.id} style={{ opacity: isNew ? 1 : 0.7 }}>
                <ListRow
                  icon={style.icon}
                  iconTone={style.tone}
                  title={isNew ? `● ${n.title}` : n.title}
                  subtitle={`${n.body} · ${timeAgo(n.at)}`}
                  onPress={() => open(n)}
                  last={i === list.length - 1}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {n.resolvedAt && <Badge tone="success">Tamam</Badge>}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={isNew ? 'Okundu say' : 'Okunmadı yap'}
                        hitSlop={10}
                        onPress={() => (isNew ? read.mutate({ ids: [n.id] }) : unread.mutate(n.id))}
                      >
                        <Icon name={isNew ? 'mail-open-outline' : 'mail-outline'} size={20} color={colors.muted} />
                      </Pressable>
                    </View>
                  }
                />
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
