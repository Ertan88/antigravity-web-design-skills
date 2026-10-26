import { router } from 'expo-router';
import { useNotifications, type PanelNotification } from '../src/data.ts';
import { timeAgo } from '../src/day.ts';
import { Card, Empty, ListRow, Loading, Screen, type IconName } from '../src/ui.tsx';

/** Paneldeki adresleri uygulamadaki ekranlara çevirir */
const ROUTES: Record<PanelNotification['kind'], string> = {
  approval: '/onaylar',
  'leave-request': '/onaylar',
  returned: '/duyurular',
  approved: '/duyurular',
  'duty-gap': '/nobet',
  'month-student': '/duyuru-yeni',
};
const ICONS: Record<PanelNotification['kind'], { icon: IconName; tone: 'primary' | 'warning' | 'danger' | 'gold' }> = {
  approval: { icon: 'checkmark-done-outline', tone: 'primary' },
  'leave-request': { icon: 'calendar-outline', tone: 'primary' },
  returned: { icon: 'arrow-undo-outline', tone: 'danger' },
  approved: { icon: 'checkmark-circle-outline', tone: 'primary' },
  'duty-gap': { icon: 'shield-checkmark-outline', tone: 'warning' },
  'month-student': { icon: 'star-outline', tone: 'gold' },
};

/** Bildirimler: onay bekleyenler, düzeltme istekleri, boş nöbet, ayın öğrencisi hatırlatması */
export default function Bildirimler() {
  const notes = useNotifications();
  const list = notes.data ?? [];
  return (
    <Screen back title="Bildirimler" refreshing={notes.isRefetching} onRefresh={() => void notes.refetch()}>
      {notes.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <Card>
          <Empty icon="notifications-outline" title="Yeni bildirim yok" text="Onay bekleyen duyurular, düzeltme istekleri ve boş nöbetler burada görünür." />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {list.map((n, i) => (
            <ListRow
              key={n.key}
              icon={ICONS[n.kind].icon}
              iconTone={ICONS[n.kind].tone}
              title={n.title}
              subtitle={`${n.body} · ${timeAgo(n.at)}`}
              onPress={() => router.push(ROUTES[n.kind] as never)}
              last={i === list.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
