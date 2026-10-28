import { PERMISSIONS } from '@okulpano/shared/permissions';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from './auth.tsx';
import { useAnnouncements, useMeToday, type Announcement } from './data.ts';
import { MenuButton, QuickAdd } from './quick.tsx';
import { TodayDutyCard } from './teacher.tsx';
import { colors } from './theme.ts';
import { Badge, Card, Empty, ListRow, Loading, Screen, SectionTitle, T } from './ui.tsx';

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
  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={12} weight="700" color={colors.primary}>
            EDİTÖR
          </T>
          <T size={22} weight="800">
            İçerik
          </T>
          <T size={13} color={colors.muted} lines={1}>
            {school?.name}
          </T>
        </View>
        <MenuButton />
      </View>

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

      <Card style={{ gap: 8, borderStyle: 'dashed' }}>
        <T size={13} weight="700" color={colors.muted}>
          Yetkileriniz (okul yöneticisi verdi)
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {granted.map((p) => (
            <Badge key={p} tone="primary">
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
