import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useMembers } from '../src/data.ts';
import { timeAgo } from '../src/day.ts';
import { formRole, permissionSummary, roleTitle, UsersTabs } from '../src/members.tsx';
import { colors } from '../src/theme.ts';
import { Badge, Button, Card, Empty, ErrorNote, ListRow, Loading, Screen, T } from '../src/ui.tsx';

/**
 * Kullanıcılar ve yetkiler (paneldekiyle aynı): kişiye dokununca rol ve yetkiler, öğretmen kaydı, şifre sıfırlama,
 * daveti yeniden gönderme ve okuldan çıkarma açılır. Yönetici atamayı yalnızca okul müdürü yapar.
 */
export default function Kullanicilar() {
  const { role, can, school } = useAuth();
  const { sekme } = useLocalSearchParams<{ sekme?: string }>();
  const members = useMembers(can('users.manage'));
  // Hesap aç sekmesindeki onay bekleyen sayısı (aynı veri Hesap aç ekranında da kullanılır)
  const rosterPath = useSchoolPath('enrollments');
  const roster = useQuery({
    queryKey: [school?.id, 'roster'],
    queryFn: () => api<{ rows: { status: string }[] }>(`${rosterPath}/roster`),
    enabled: Boolean(school) && can('users.manage'),
  });
  const pending = roster.data?.rows.filter((r) => r.status === 'pending').length ?? 0;

  // Hesap açma bildirimleri (?sekme=kadro) ve yalnızca "Öğretmen hesabı açma" yetkisi olanlar hesap açma ekranına gider
  if (sekme === 'kadro' || (!can('users.manage') && can('accounts.enroll'))) return <Redirect href="/hesap-ac" />;

  if (!can('users.manage')) {
    return (
      <Screen back title="Kullanıcılar">
        <Card>
          <Empty icon="lock-closed-outline" title="Bu ekran için yetkiniz yok" />
        </Card>
      </Screen>
    );
  }

  const list = members.data ?? [];
  return (
    <Screen
      back
      title="Kullanıcılar ve yetkiler"
      subtitle={list.length ? `${list.length} kullanıcı` : undefined}
      refreshing={members.isRefetching}
      onRefresh={() => void members.refetch()}
      right={
        <Button size="sm" icon="person-add-outline" onPress={() => router.push('/kullanici/yeni')}>
          Ekle
        </Button>
      }
    >
      <UsersTabs value="users" pending={pending} />
      <ErrorNote error={members.error} />
      {members.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <Card>
          <Empty icon="people-outline" title="Kullanıcı yok" />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {list.map((m, i) => (
            <View key={m.id}>
              <ListRow
                icon={m.role === 'owner' ? 'star-outline' : m.role === 'admin' ? 'shield-outline' : formRole(m) === 'counselor' ? 'heart-outline' : 'person-outline'}
                iconTone={m.role === 'editor' ? 'muted' : 'primary'}
                title={m.fullName}
                subtitle={[
                  roleTitle(m),
                  m.email,
                  m.teacherName ? `öğretmen: ${m.teacherName}` : null,
                  permissionSummary(m),
                  m.invitePending ? null : m.lastLoginAt ? `son giriş ${timeAgo(m.lastLoginAt)}` : 'hiç girmedi',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={m.invitePending ? <Badge tone="warning">Davet bekliyor</Badge> : undefined}
                onPress={() => router.push(`/kullanici/${m.id}`)}
                last={i === list.length - 1}
              />
            </View>
          ))}
        </Card>
      )}
      <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
        {role === 'owner' ? 'Yönetici atamayı yalnızca okul müdürü yapar.' : 'Yöneticileri yalnızca okul müdürü atar ve değiştirir.'} Editörler yalnızca seçtiğiniz bölümleri düzenleyebilir.
      </T>
    </Screen>
  );
}
