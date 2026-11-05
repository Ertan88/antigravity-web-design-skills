import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useAuth } from '../../src/auth.tsx';
import { useScreens, type Screen as Board } from '../../src/data.ts';
import { timeAgo } from '../../src/day.ts';
import { PairCard } from '../../src/pair.tsx';
import { colors } from '../../src/theme.ts';
import { Card, Empty, ErrorNote, Icon, Loading, Screen, T } from '../../src/ui.tsx';

const MODE_LABEL = { board: 'Tam pano', slides: 'Yalnızca duyurular', clock: 'Tam ekran saat' } as const;

/** Panolar (tasarım 5): canlı durum, bağlantısı kopan pano öne çıkar; dokununca uzaktan kumanda */
export default function Panolar() {
  const { can } = useAuth();
  const screens = useScreens();
  const list = [...(screens.data ?? [])].sort((a, b) => Number(a.online) - Number(b.online) || a.name.localeCompare(b.name, 'tr'));
  const online = list.filter((s) => s.online).length;
  return (
    <Screen
      title="Panolar"
      subtitle={screens.data ? `${list.length} pano · ${online} çevrimiçi` : undefined}
      refreshing={screens.isRefetching}
      onRefresh={() => void screens.refetch()}
    >
      <ErrorNote error={screens.error} />
      {screens.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <Card>
          <Empty icon="tv-outline" title="Henüz pano yok" text="Okuldaki televizyonda pano adresini açın; ekrandaki QR kodu okutun ya da 6 haneli kodu yazın." />
        </Card>
      ) : (
        list.map((s) => <BoardRow key={s.id} s={s} />)
      )}
      {can('screens.manage') && <PairCard />}
    </Screen>
  );
}

function BoardRow({ s }: { s: Board }) {
  const status = s.online
    ? s.live
      ? s.live.sleeping
        ? 'Uyku modunda'
        : s.live.mode === 'emergency'
          ? 'Acil durum gösteriliyor'
          : s.live.mode === 'clock'
            ? 'Tam ekran saat'
            : `Şu an: ${s.live.slideTitle ?? '—'}${s.live.paused ? ' · duraklatıldı' : ''}`
      : 'Canlı'
    : s.lastSeenAt
      ? `${timeAgo(s.lastSeenAt)} bağlantı koptu`
      : 'Hiç bağlanmadı';
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/pano/${s.id}`)}>
      <Card tone={s.online ? 'default' : 'warning'} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.online ? '#16a34a' : colors.warning }} accessibilityLabel={s.online ? 'Çevrimiçi' : 'Çevrimdışı'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="700" size={16}>
            {s.name}
          </T>
          <T size={13} color={s.online ? colors.muted : colors.warning} lines={1}>
            {status}
          </T>
          <T size={12} color={colors.faint}>
            {MODE_LABEL[s.display.mode]} · {s.display.orientation === 'portrait' ? 'dikey' : 'yatay'}
            {s.location ? ` · ${s.location}` : ''}
          </T>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.faint} />
      </Card>
    </Pressable>
  );
}
