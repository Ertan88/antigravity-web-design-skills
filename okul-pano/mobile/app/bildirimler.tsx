import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useInbox, useInboxActions, type InboxItem } from '../src/data.ts';
import { timeAgo } from '../src/day.ts';
import { Sheet } from '../src/sheet.tsx';
import { Text } from '../src/text.tsx';
import { colors } from '../src/theme.ts';
import { Badge, Button, Card, Empty, Icon, ListRow, Loading, Screen, Segmented, T, type IconName } from '../src/ui.tsx';

/** Paneldeki adresleri uygulamadaki ekranlara çevirir */
const ROUTES: Record<string, string> = {
  approval: '/onaylar',
  'leave-request': '/onaylar',
  returned: '/duyurular',
  approved: '/duyurular',
  'duty-gap': '/nobet',
  'month-student': '/duyuru-yeni',
  'support-access': '/okullar',
  'support-revoked': '/okullar',
  'support-expired': '/okullar',
  'meb-calendar': '/takvim',
  internship: '/isletme-devam',
  enroll: '/kullanicilar',
};
const ICONS: Record<string, { icon: IconName; tone: 'primary' | 'warning' | 'danger' | 'gold' | 'muted' }> = {
  approval: { icon: 'checkmark-done-outline', tone: 'primary' },
  'leave-request': { icon: 'calendar-outline', tone: 'primary' },
  returned: { icon: 'arrow-undo-outline', tone: 'danger' },
  approved: { icon: 'checkmark-circle-outline', tone: 'primary' },
  'duty-gap': { icon: 'shield-checkmark-outline', tone: 'warning' },
  'month-student': { icon: 'star-outline', tone: 'gold' },
  'bridge-day': { icon: 'calendar-outline', tone: 'warning' },
  'support-access': { icon: 'key-outline', tone: 'primary' },
  'support-revoked': { icon: 'lock-closed-outline', tone: 'muted' },
  'support-expired': { icon: 'lock-closed-outline', tone: 'muted' },
  'meb-calendar': { icon: 'calendar-outline', tone: 'primary' },
  internship: { icon: 'business-outline', tone: 'warning' },
  exam: { icon: 'clipboard-check', tone: 'primary' },
  issue: { icon: 'alert-triangle', tone: 'warning' },
  'support-reply': { icon: 'lifebuoy', tone: 'primary' },
  'support-ticket': { icon: 'lifebuoy', tone: 'gold' },
  enroll: { icon: 'people-outline', tone: 'primary' },
  'screen-security': { icon: 'shield-outline', tone: 'warning' },
};
const FALLBACK = { icon: 'notifications-outline' as IconName, tone: 'muted' as const };

/**
 * Bildirimler: yeni olanlar ve okunanlar dahil geçmiş (panelle aynı kutu). Dokununca okundu sayılır ve bildirimin
 * tamamı açılır (listede iki satır görünür); ilgili ekrana oradan gidilir. Zarf simgesi okundu / okunmadı yapar.
 */
export default function Bildirimler() {
  return <InboxScreen back />;
}

/** Alt menüdeki Bildirimler sekmesi de aynı ekranı geri düğmesi olmadan kullanır */
export function InboxScreen({ back }: { back?: boolean }) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const inbox = useInbox(filter);
  const { read, unread, readAll } = useInboxActions();
  const list = inbox.data?.items ?? [];
  const unreadCount = inbox.data?.unread ?? 0;

  const [detail, setDetail] = useState<InboxItem | null>(null);
  const open = (n: InboxItem) => {
    if (!n.readAt) read.mutate({ ids: [n.id] });
    setDetail(n);
  };
  // İşletmede devamsızlık: bildirilen ayın çizelgesi açılır
  const routeOf = (n: InboxItem) => {
    // Sorun ve destek bildirimleri doğrudan ilgili yazışmayı açar
    const id = /[?&]id=([\w-]+)/.exec(n.to)?.[1];
    if (n.kind === 'issue') return id ? `/sorun/${id}` : '/sorunlar';
    if (n.kind === 'support-reply') return id ? `/talep/${id}` : '/platforma-yaz';
    if (n.kind === 'support-ticket') return id ? `/talep/${id}?p=1` : '/platform/destek';
    const month = n.kind === 'internship' ? /[?&]gun=(\d{4}-\d{2})-\d{2}/.exec(n.to)?.[1] : null;
    return month ? `/isletme-devam?ay=${month}` : ROUTES[n.kind];
  };

  return (
    <Screen back={back} title="Bildirimler" refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()}>
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
                  title={n.title}
                  subtitle={`${isNew ? 'Yeni · ' : ''}${n.body} · ${timeAgo(n.at)}`}
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
      {detail && <Detail n={detail} to={routeOf(detail)} onClose={() => setDetail(null)} onUnread={() => { unread.mutate(detail.id); setDetail(null); }} />}
    </Screen>
  );
}

const fullTime = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Bildirimin tamamı: başlık, zaman, metnin hepsi; varsa ilgili ekrana geçiş */
function Detail({ n, to, onClose, onUnread }: { n: InboxItem; to?: string; onClose: () => void; onUnread: () => void }) {
  const style = ICONS[n.kind] ?? FALLBACK;
  return (
    <Sheet open onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={style.icon} size={22} color={colors.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{n.title}</Text>
          <T size={12.5} color={colors.faint}>
            {fullTime(n.at)} · {timeAgo(n.at)}
          </T>
        </View>
        {n.resolvedAt && <Badge tone="success">Tamam</Badge>}
      </View>
      <ScrollView style={{ maxHeight: 360, marginTop: 14 }}>
        <Text selectable style={{ fontSize: 15, lineHeight: 22, color: colors.ink }}>
          {n.body}
        </Text>
      </ScrollView>
      <View style={{ gap: 8, marginTop: 16 }}>
        {to && (
          <Button
            icon="arrow-forward"
            onPress={() => {
              onClose();
              router.push(to as never);
            }}
          >
            İlgili ekranı aç
          </Button>
        )}
        <Button variant="secondary" icon="mail-outline" onPress={onUnread}>
          Okunmadı yap
        </Button>
      </View>
    </Sheet>
  );
}
