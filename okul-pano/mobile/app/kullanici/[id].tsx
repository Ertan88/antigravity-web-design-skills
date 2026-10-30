import type { Permission } from '@okulpano/shared/permissions';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../src/api.ts';
import { useAuth, useSchoolPath } from '../../src/auth.tsx';
import { useMembers, useTeachers, type Member } from '../../src/data.ts';
import { timeAgo } from '../../src/day.ts';
import { AccessResult, apiRole, formRole, permissionSummary, RoleEditor, roleTitle, TeacherPicker, type FormRole } from '../../src/members.tsx';
import { colors } from '../../src/theme.ts';
import { Avatar, Badge, Button, Card, confirm, Empty, ErrorNote, Field, Loading, Screen, SectionTitle, T, ToggleRow } from '../../src/ui.tsx';

/** Bir kullanıcı: rol ve yetkiler, öğretmen kaydı, giriş (şifre sıfırlama, davet) ve okuldan çıkarma */
export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const members = useMembers(can('users.manage'));
  const m = members.data?.find((x) => x.id === id);
  return (
    <Screen back title={m?.fullName ?? 'Kullanıcı'} subtitle={m?.email} refreshing={members.isRefetching} onRefresh={() => void members.refetch()}>
      <ErrorNote error={members.error} />
      {members.isLoading ? <Loading /> : !m ? <Card><Empty icon="person-outline" title="Kullanıcı bulunamadı" /></Card> : <MemberDetail key={m.id} m={m} />}
    </Screen>
  );
}

function MemberDetail({ m }: { m: Member }) {
  const { me, role: myRole } = useAuth();
  const path = useSchoolPath('members');
  const qc = useQueryClient();
  const teachers = useTeachers();
  const teacherList = (teachers.data ?? []).filter((t) => t.isActive !== false);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === 'members' });
  // Okul sahibi, kişinin kendisi ve (okul sahibi değilse) yöneticiler kilitli; öğretmen eşleştirmesi herkes için yapılır
  const locked = m.role === 'owner' || m.userId === me?.user.id || (m.role === 'admin' && myRole !== 'owner');

  const [role, setRole] = useState<FormRole>(formRole(m));
  const [permissions, setPermissions] = useState<Permission[]>(m.permissions.filter((p) => p !== 'conduct.counsel'));
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api(`${path}/${m.id}`, { method: 'PATCH', body: apiRole(role, permissions) }),
    onSuccess: () => {
      setSaved(true);
      void refresh();
    },
  });
  const link = useMutation({
    mutationFn: (teacherId: string | null) => api(`${path}/${m.id}/teacher`, { method: 'PUT', body: { teacherId } }),
    onSuccess: () => void refresh(),
  });

  const [result, setResult] = useState<{ kind: 'password' | 'invite'; secret: string; emailed: boolean } | null>(null);
  const reinvite = useMutation({
    mutationFn: () => api<{ inviteUrl: string; emailed: boolean }>(`${path}/${m.id}/invite`, { method: 'POST' }),
    onSuccess: (r) => setResult({ kind: 'invite', secret: r.inviteUrl, emailed: r.emailed }),
  });
  const [resetting, setResetting] = useState(false);
  const [own, setOwn] = useState(false);
  const [password, setPassword] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const reset = useMutation({
    mutationFn: () => api<{ password: string; emailed: boolean }>(`${path}/${m.id}/password`, { method: 'POST', body: { sendEmail, ...(own && password ? { password } : {}) } }),
    onSuccess: (r) => {
      setResetting(false);
      setOwn(false);
      setPassword('');
      setResult({ kind: 'password', secret: r.password, emailed: r.emailed });
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`${path}/${m.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void refresh();
      router.back();
    },
  });

  return (
    <>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={m.fullName} size={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="800" size={16}>
            {m.fullName}
          </T>
          <T size={13} color={colors.muted}>
            {m.invitePending ? 'Davet bekliyor · şifresini henüz belirlemedi' : m.lastLoginAt ? `Son giriş ${timeAgo(m.lastLoginAt)}` : 'Hiç giriş yapmadı'}
          </T>
        </View>
        <Badge tone={m.role === 'editor' ? (formRole(m) === 'counselor' ? 'success' : 'muted') : 'primary'}>{roleTitle(m)}</Badge>
      </Card>

      {result && <AccessResult kind={result.kind} fullName={m.fullName} email={m.email} secret={result.secret} emailed={result.emailed} onDone={() => setResult(null)} />}

      <SectionTitle>Rol ve yetkiler</SectionTitle>
      {locked ? (
        <Card>
          <T size={14}>{permissionSummary(m)}</T>
          <T size={12.5} color={colors.muted}>
            {m.role === 'owner' ? 'Okul sahibinin yetkileri değiştirilemez.' : m.userId === me?.user.id ? 'Kendi yetkilerinizi değiştiremezsiniz.' : 'Yöneticileri yalnızca okul sahibi (müdür) değiştirir.'}
          </T>
        </Card>
      ) : (
        <Card style={{ gap: 12 }}>
          <RoleEditor
            role={role}
            permissions={permissions}
            onRole={(r) => (setRole(r), setSaved(false))}
            onPermissions={(p) => (setPermissions(p), setSaved(false))}
          />
          <ErrorNote error={save.error} />
          <Button loading={save.isPending} icon={saved ? 'checkmark' : undefined} onPress={() => save.mutate()}>
            {saved ? 'Kaydedildi' : 'Kaydet'}
          </Button>
        </Card>
      )}

      <SectionTitle>Öğretmen kaydı</SectionTitle>
      <Card style={{ gap: 8 }}>
        <TeacherPicker value={m.teacherId} teachers={teacherList} disabled={link.isPending} onChange={(t) => link.mutate(t)} />
        <T size={12.5} color={colors.muted}>
          Öğretmense seçin: mobil uygulamada kendi ders programını ve nöbetlerini görür, izin bildirebilir, gözlem girebilir.
        </T>
        <ErrorNote error={link.error} />
      </Card>

      {!locked && (
        <>
          <SectionTitle>Giriş</SectionTitle>
          <Card style={{ gap: 10 }}>
            {m.invitePending && (
              <Button variant="secondary" icon="send-outline" loading={reinvite.isPending} onPress={() => reinvite.mutate()}>
                Daveti yeniden gönder
              </Button>
            )}
            {!resetting ? (
              <Button variant="secondary" icon="key-outline" onPress={() => setResetting(true)}>
                Şifreyi sıfırla
              </Button>
            ) : (
              <View style={{ gap: 6 }}>
                <ToggleRow label="Şifreyi ben belirleyeceğim" description="Kapalıyken okunaklı, güçlü bir şifre üretilir." value={own} onChange={setOwn} />
                {own && <Field label="Yeni şifre" help="En az 8 karakter" value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="new-password" />}
                <ToggleRow label="Kullanıcıya e-postayla gönder" description="Sunucuda e-posta ayarlı değilse bilgiler ekranda gösterilir; oradan paylaşabilirsiniz." value={sendEmail} onChange={setSendEmail} />
                <T size={12.5} color={colors.muted}>
                  Kullanıcının açık oturumları kapanır; yeni şifreyle yeniden giriş yapması gerekir.
                </T>
                <ErrorNote error={reset.error} />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Button icon="key-outline" loading={reset.isPending} disabled={own && password.length < 8} onPress={() => reset.mutate()} style={{ flex: 1 }}>
                    Şifreyi sıfırla
                  </Button>
                  <Button variant="secondary" onPress={() => setResetting(false)}>
                    Vazgeç
                  </Button>
                </View>
              </View>
            )}
            <ErrorNote error={reinvite.error} />
          </Card>

          <Button
            variant="danger"
            icon="trash-outline"
            loading={remove.isPending}
            onPress={() => void confirm('Erişim kaldırılsın mı?', `${m.fullName} artık bu okula giriş yapamaz.`, 'Kaldır').then((ok) => ok && remove.mutate())}
          >
            Okul erişimini kaldır
          </Button>
          <ErrorNote error={remove.error} />
        </>
      )}
    </>
  );
}
