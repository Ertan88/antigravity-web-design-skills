import { router } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../src/auth.tsx';
import { useMembers } from '../src/data.ts';
import { timeAgo } from '../src/day.ts';
import { formRole, permissionSummary, roleTitle } from '../src/members.tsx';
import { colors } from '../src/theme.ts';
import { Badge, Button, Card, Empty, ErrorNote, ListRow, Loading, Screen, T } from '../src/ui.tsx';

/**
 * Kullanıcılar ve yetkiler (paneldekiyle aynı): kişiye dokununca rol ve yetkiler, öğretmen kaydı, şifre sıfırlama,
 * daveti yeniden gönderme ve okuldan çıkarma açılır. Yönetici atamayı yalnızca okul sahibi (müdür) yapar.
 */
export default function Kullanicilar() {
  const { role, can } = useAuth();
  const members = useMembers(can('users.manage'));

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
        {role === 'owner' ? 'Yönetici atamayı yalnızca okul sahibi yapar.' : 'Yöneticileri yalnızca okul sahibi (müdür) atar ve değiştirir.'} Editörler yalnızca seçtiğiniz bölümleri düzenleyebilir.
      </T>
    </Screen>
  );
}
