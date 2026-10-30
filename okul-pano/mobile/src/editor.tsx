import { PERMISSIONS } from '@okulpano/shared/permissions';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from './auth.tsx';
import { useAnnouncements, useMeToday, type Announcement } from './data.ts';
import { MenuButton, QuickAdd } from './quick.tsx';
import { DayBanner, NotificationsButton, TodayDutyCard } from './teacher.tsx';
import { homeTitle, localIso } from './day.ts';
import { colors } from './theme.ts';
import { Badge, BentoRow, Card, Empty, HomeHeader, ListRow, Loading, Screen, SectionTitle, T, Tile } from './ui.tsx';

function status(a: Announcement): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
  if (a.approvalStatus === 'pending') return { label: 'Onay bekliyor', tone: 'warning' };
  if (a.approvalStatus === 'rejected') return { label: 'Düzeltme istendi', tone: 'danger' };
  if (!a.isActive || (a.endsAt && Date.parse(a.endsAt) <= Date.now())) return { label: 'Yayında değil', tone: 'muted' };
  return { label: 'Yayında', tone: 'success' };
}

/** Editörün ana ekranı: hızlı ekle, duyurularının durumu ve verilen yetkiler */
export function EditorHome() {
  const { me, school, can, isTeacher } = useAuth();
  const list = useAnnouncements();
  const today = useMeToday();
  const mine = (list.data ?? []).filter((a) => a.createdBy === me?.user.id).slice(0, 5);
  const granted = school?.permissions ?? [];
  const all = (list.data ?? []).filter((a) => a.createdBy === me?.user.id);
  const counts = {
    live: all.filter((a) => status(a).tone === 'success').length,
    pending: all.filter((a) => a.approvalStatus === 'pending').length,
    rejected: all.filter((a) => a.approvalStatus === 'rejected').length,
  };
  const [day, date] = homeTitle(localIso());
  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <HomeHeader name={me?.user.fullName} school={school?.name} role="Editör" title={day} titleMuted={date}>
        <NotificationsButton />
        <MenuButton />
      </HomeHeader>
      {today.data ? <DayBanner data={today.data} /> : null}

      {can('announcements.manage') && !list.isLoading && (
        <BentoRow>
          <Tile tone="mint" icon="radio-outline" label="Yayında" value={counts.live} caption="duyurum" onPress={() => router.push('/duyurular')} style={{ flex: 1 }} />
          <Tile tone={counts.pending ? 'peach' : 'paper'} icon="hourglass-outline" label="Onayda" value={counts.pending} caption={counts.rejected ? `${counts.rejected} düzeltme istendi` : 'bekleyen'} onPress={() => router.push('/duyurular')} style={{ flex: 1 }} />
        </BentoRow>
      )}

      <QuickAdd title="Ekle" />

      {can('announcements.manage') && (
        <>
          <SectionTitle>Duyurularım</SectionTitle>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {list.isLoading ? (
              <Loading />
            ) : mine.length ? (
              mine.map((a, i) => {
                const st = status(a);
                return (
                  <ListRow
                    key={a.id}
                    title={a.title}
                    subtitle={a.approvalStatus === 'rejected' ? a.reviewNote : null}
                    right={<Badge tone={st.tone}>{st.label}</Badge>}
                    onPress={() => router.push('/duyurular')}
                    last={i === mine.length - 1}
                  />
                );
              })
            ) : (
              <Empty icon="megaphone-outline" title="Henüz duyuru göndermediniz" />
            )}
          </Card>
        </>
      )}

      {isTeacher && today.data && <TodayDutyCard data={today.data} />}

      <Card style={{ gap: 8, backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: colors.borderStrong }}>
        <T size={13} weight="700" color={colors.muted}>
          Yetkileriniz (okul yöneticisi verdi)
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {granted.map((p) => (
            <Badge key={p}>
              {PERMISSIONS[p]}
            </Badge>
          ))}
        </View>
        <T size={12} color={colors.muted}>
          Alt menü bu yetkilere göre oluşur.
          {school && can('announcements.manage') && !can('announcements.approve') ? ' Duyurularınız yayına girmeden önce onaya gidebilir.' : ''}
        </T>
      </Card>
    </Screen>
  );
}
