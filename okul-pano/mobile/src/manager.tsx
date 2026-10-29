import { EMERGENCY_INFO } from '@okulpano/shared/emergency';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from './text.tsx';
import { useAuth } from './auth.tsx';
import { useControlCenter, useMeToday, type ControlCenter } from './data.ts';
import { clock, homeTitle, localIso, timeAgo } from './day.ts';
import { MenuButton, QuickAdd } from './quick.tsx';
import { DayBanner, MyDayCard, NotificationsButton } from './teacher.tsx';
import { tiles } from './theme.ts';
import { Banner, BentoRow, Card, ErrorNote, HomeHeader, ListRow, Loading, Screen, SectionTitle, Tile } from './ui.tsx';

/** Koyu pano kutusu: kaç pano açık, kapalı olanlar adlarıyla ve en son ne zaman görüldükleriyle */
function ScreensTile({ screens }: { screens: ControlCenter['screens'] }) {
  const t = tiles.ink;
  const shown = screens.offline.slice(0, 4);
  const more = screens.offline.length - shown.length;
  return (
    <Tile tone="ink" icon="tv-outline" label="Panolar" value={screens.online} unit={`/${screens.total}`} caption="çevrimiçi" onPress={() => router.push('/panolar')} style={{ flex: 1 }} big>
      <View style={{ marginTop: 14, gap: 9 }}>
        {screens.total === 0 ? (
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.sub }}>Henüz pano eklenmedi</Text>
        ) : shown.length === 0 ? (
          <Row dot="#4ade80" name="Hepsi açık" />
        ) : (
          shown.map((s) => <Row key={s.id} dot="#f43f5e" name={s.name} when={s.lastSeenAt ? timeAgo(s.lastSeenAt) : 'hiç'} />)
        )}
        {more > 0 && <Text style={{ fontSize: 12, fontWeight: '700', color: t.sub }}>+{more} pano daha</Text>}
      </View>
    </Tile>
  );
}

function Row({ dot, name, when }: { dot: string; name: string; when?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: '#fff' }} numberOfLines={1}>
        {name}
      </Text>
      {when ? <Text style={{ fontSize: 11, fontWeight: '600', color: tiles.ink.sub }}>{when.replace(' önce', '')}</Text> : null}
    </View>
  );
}

/** Yöneticinin ana ekranı: bento kontrol merkezi */
export function ManagerHome() {
  const { me: account, school, role, isTeacher } = useAuth();
  const center = useControlCenter();
  const me = useMeToday();
  const c = center.data;
  const [day, date] = homeTitle(c?.today ?? localIso());
  const pending = c ? c.pending.announcements + c.pending.leaves : 0;

  // Pano ve onay durumu kutularda; listede yalnızca kutulara sığmayan işler kalır
  const attention = c
    ? [
        ...c.dutyGaps.map((g) => ({
          key: `gap-${g.dutyId}`,
          icon: 'shield-checkmark-outline' as const,
          tone: 'warning' as const,
          title: `${g.area} nöbeti boş`,
          subtitle: `${g.teacherName} bugün izinli · yerine atayın`,
          to: '/nobet',
        })),
        ...(c.endingToday.length
          ? [
              {
                key: 'ending',
                icon: 'calendar-outline' as const,
                tone: 'primary' as const,
                title: `${c.endingToday.length} duyurunun süresi bugün bitiyor`,
                subtitle: c.endingToday.map((a) => a.title).slice(0, 2).join(' · '),
                to: '/yayin-akisi',
              },
            ]
          : []),
      ]
    : [];

  return (
    <Screen refreshing={center.isRefetching} onRefresh={() => void center.refetch()}>
      <HomeHeader name={account?.user.fullName} school={school?.name} role={school?.support ? 'Destek erişimi' : role === 'owner' ? 'Okul sahibi' : 'Yönetici'} title={day} titleMuted={date}>
        <NotificationsButton />
        <MenuButton />
      </HomeHeader>
      <ErrorNote error={center.error} />
      {!c ? (
        <Loading />
      ) : (
        <>
          {c.emergency && (
            <Pressable accessibilityRole="button" onPress={() => router.push('/acil')}>
              <Banner tone="danger" icon="warning" title={`Acil durum sürüyor: ${EMERGENCY_INFO[c.emergency.type].label}`} text={[clock(c.emergency.startedAt), c.emergency.startedBy].filter(Boolean).join(' · ')} />
            </Pressable>
          )}
          {me.data ? <DayBanner data={me.data} /> : c.holiday ? <Banner icon="sunny" title="Bugün tatil" text={`${c.holiday} · zil çalmıyor`} /> : null}

          <BentoRow>
            <ScreensTile screens={c.screens} />
            <View style={{ flex: 1, gap: 10 }}>
              <Tile
                tone={pending ? 'peach' : 'paper'}
                icon="checkmark-done-outline"
                label="Onay"
                value={pending}
                caption={pending ? [c.pending.announcements ? `${c.pending.announcements} duyuru` : null, c.pending.leaves ? `${c.pending.leaves} izin` : null].filter(Boolean).join(' · ') : 'bekleyen yok'}
                onPress={() => router.push('/onaylar')}
                style={{ flex: 1 }}
              />
              <Tile tone="mint" icon="radio-outline" label="Yayında" value={c.onAir} caption="içerik" onPress={() => router.push('/yayin-akisi')} style={{ flex: 1 }} />
            </View>
          </BentoRow>

          {attention.length > 0 && (
            <>
              <SectionTitle>İlgilenmeniz gerekenler</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {attention.map((a, i) => (
                  <ListRow key={a.key} icon={a.icon} iconTone={a.tone} title={a.title} subtitle={a.subtitle} onPress={() => router.push(a.to as never)} last={i === attention.length - 1} />
                ))}
              </Card>
            </>
          )}

          <QuickAdd />

          {isTeacher && me.data?.teacher && (
            <>
              <SectionTitle>Benim günüm</SectionTitle>
              <MyDayCard data={me.data} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
