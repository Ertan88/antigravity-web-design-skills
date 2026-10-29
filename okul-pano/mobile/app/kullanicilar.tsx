import { ADMIN_ONLY_PERMISSIONS, PERMISSION_KEYS, PERMISSIONS, ROLES, type Permission } from '@okulpano/shared/permissions';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Share, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useMembers, type Member } from '../src/data.ts';
import { timeAgo } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Badge, Button, Card, Choice, confirm, Empty, ErrorNote, Field, ListRow, Loading, Screen, SectionTitle, T, ToggleRow } from '../src/ui.tsx';

/** Editöre verilebilen yetkiler (kullanıcı yönetimi yalnız sahip ve yöneticide) */
const GRANTABLE = PERMISSION_KEYS.filter((p) => !ADMIN_ONLY_PERMISSIONS.includes(p));
type EditRole = 'admin' | 'editor';

/** Rol ve yetki seçimi: yönetici rolünü yalnızca okul sahibi verir */
function RoleEditor({
  role,
  permissions,
  onRole,
  onPermissions,
  canAssignAdmin,
}: {
  role: EditRole;
  permissions: Permission[];
  onRole: (r: EditRole) => void;
  onPermissions: (p: Permission[]) => void;
  canAssignAdmin: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      {canAssignAdmin && (
        <Choice
          value={role}
          onChange={onRole}
          options={[
            { value: 'editor', label: 'Editör', description: 'Yalnızca verilen yetkiler' },
            { value: 'admin', label: 'Yönetici', description: 'Her şey açık; editör ekler' },
          ]}
        />
      )}
      {role === 'editor' &&
        GRANTABLE.map((p) => (
          <ToggleRow
            key={p}
            label={PERMISSIONS[p]}
            value={permissions.includes(p)}
            onChange={(on) => onPermissions(on ? [...permissions, p] : permissions.filter((x) => x !== p))}
          />
        ))}
    </View>
  );
}

/**
 * Kullanıcılar ve yetkiler: davet, editör ekleme ve yetki verme. Okul sahibi (müdür) yönetici de atar;
 * yönetici yalnızca editör ekler ve yöneticileri değiştiremez.
 */
export default function Kullanicilar() {
  const { me, role, can } = useAuth();
  const members = useMembers(can('users.manage'));
  const path = useSchoolPath('members');
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const isOwner = role === 'owner';
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === 'members' });

  if (!can('users.manage')) {
    return (
      <Screen back title="Kullanıcılar">
        <Card>
          <Empty icon="lock-closed-outline" title="Bu ekran için yetkiniz yok" />
        </Card>
      </Screen>
    );
  }

  const editable = (m: Member) => m.userId !== me?.user.id && m.role !== 'owner' && (isOwner || m.role !== 'admin');
  const list = members.data ?? [];

  return (
    <Screen
      back
      title="Kullanıcılar ve yetkiler"
      refreshing={members.isRefetching}
      onRefresh={() => void members.refetch()}
      right={
        !adding ? (
          <Button size="sm" icon="person-add-outline" onPress={() => setAdding(true)}>
            Ekle
          </Button>
        ) : undefined
      }
    >
      {adding && <AddMember path={path} isOwner={isOwner} onDone={() => (setAdding(false), void refresh())} />}
      <ErrorNote error={members.error} />
      {members.isLoading ? (
        <Loading />
      ) : (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {list.map((m, i) => (
            <View key={m.id}>
              <ListRow
                icon={m.role === 'owner' ? 'star-outline' : m.role === 'admin' ? 'shield-outline' : 'person-outline'}
                iconTone={m.role === 'editor' ? 'muted' : 'primary'}
                title={m.fullName}
                subtitle={[
                  m.email,
                  m.teacherName ? `öğretmen: ${m.teacherName}` : null,
                  m.invitePending ? 'davet bekliyor' : m.lastLoginAt ? `son giriş ${timeAgo(m.lastLoginAt)}` : 'hiç girmedi',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={<Badge tone={m.role === 'editor' ? 'muted' : 'primary'}>{ROLES[m.role]}</Badge>}
                onPress={editable(m) ? () => setOpen(open === m.id ? null : m.id) : undefined}
                last={i === list.length - 1 && open !== m.id}
              />
              {open === m.id && <EditMember m={m} path={path} isOwner={isOwner} onDone={() => (setOpen(null), void refresh())} />}
            </View>
          ))}
        </Card>
      )}
      <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
        {isOwner ? 'Yönetici atamayı yalnızca okul sahibi yapar.' : 'Yöneticileri yalnızca okul sahibi (müdür) atar ve değiştirir.'} Öğretmen eşleştirmesi ve
        şifre sıfırlama yönetim panelindedir.
      </T>
    </Screen>
  );
}

function EditMember({ m, path, isOwner, onDone }: { m: Member; path: string; isOwner: boolean; onDone: () => void }) {
  const [role, setRole] = useState<EditRole>(m.role === 'admin' ? 'admin' : 'editor');
  const [permissions, setPermissions] = useState<Permission[]>(m.permissions);
  const save = useMutation({
    mutationFn: () => api(`${path}/${m.id}`, { method: 'PATCH', body: { role, permissions: role === 'editor' ? permissions : [] } }),
    onSuccess: onDone,
  });
  const remove = useMutation({ mutationFn: () => api(`${path}/${m.id}`, { method: 'DELETE' }), onSuccess: onDone });
  return (
    <View style={{ gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1efea' }}>
      <RoleEditor role={role} permissions={permissions} onRole={setRole} onPermissions={setPermissions} canAssignAdmin={isOwner} />
      <ErrorNote error={save.error ?? remove.error} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button size="sm" loading={save.isPending} onPress={() => save.mutate()} style={{ flex: 1 }}>
          Kaydet
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon="trash-outline"
          loading={remove.isPending}
          onPress={() =>
            void confirm('Kullanıcı okuldan çıkarılsın mı?', `${m.fullName} artık bu okula giriş yapamaz.`, 'Çıkar').then((ok) => ok && remove.mutate())
          }
        >
          Çıkar
        </Button>
      </View>
    </View>
  );
}

function AddMember({ path, isOwner, onDone }: { path: string; isOwner: boolean; onDone: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<EditRole>('editor');
  const [permissions, setPermissions] = useState<Permission[]>(['announcements.manage']);
  const [result, setResult] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () =>
      api<{ existingUser: boolean; invite: { emailed: boolean; inviteUrl: string } | null }>(path, {
        method: 'POST',
        body: { fullName: fullName.trim(), email: email.trim().toLowerCase(), role, permissions: role === 'editor' ? permissions : [], invite: true },
      }),
    onSuccess: (r) => {
      setInviteUrl(r.invite && !r.invite.emailed ? r.invite.inviteUrl : null);
      setResult(
        r.existingUser
          ? 'Kişinin hesabı zaten vardı: kendi şifresiyle bu okula da girebilir.'
          : r.invite?.emailed
            ? 'Davet e-postası gönderildi.'
            : 'Kullanıcı eklendi. E-posta gönderilemedi; davet bağlantısını paylaşın.',
      );
    },
  });
  return (
    <Card style={{ gap: 10 }}>
      <SectionTitle>Yeni kullanıcı</SectionTitle>
      {result ? (
        <>
          <T color={colors.success} weight="600">
            {result}
          </T>
          {inviteUrl && (
            <Button
              size="sm"
              variant="secondary"
              icon="share-outline"
              onPress={() => void Share.share({ message: `${fullName.trim()}, Okulyayın davetiniz: ${inviteUrl}` })}
            >
              Davet bağlantısını paylaş
            </Button>
          )}
          <Button size="sm" onPress={onDone}>
            Tamam
          </Button>
        </>
      ) : (
        <>
          <Field label="Ad soyad" value={fullName} onChangeText={setFullName} maxLength={80} />
          <Field
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            help="Kişiye davet gider, şifresini kendisi belirler."
          />
          <RoleEditor role={role} permissions={permissions} onRole={setRole} onPermissions={setPermissions} canAssignAdmin={isOwner} />
          <ErrorNote error={add.error} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              size="sm"
              icon="send-outline"
              loading={add.isPending}
              disabled={fullName.trim().length < 2 || !email.includes('@')}
              onPress={() => add.mutate()}
              style={{ flex: 1 }}
            >
              Davet gönder
            </Button>
            <Button size="sm" variant="secondary" onPress={onDone}>
              Vazgeç
            </Button>
          </View>
        </>
      )}
    </Card>
  );
}
