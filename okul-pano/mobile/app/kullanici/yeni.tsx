import type { Permission } from '@okulpano/shared/permissions';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../src/api.ts';
import { useSchoolPath } from '../../src/auth.tsx';
import { useTeachers } from '../../src/data.ts';
import { AccessResult, apiRole, matchTeacher, RoleEditor, TeacherPicker, type FormRole } from '../../src/members.tsx';
import { colors } from '../../src/theme.ts';
import { Button, Card, ErrorNote, Field, Screen, SectionTitle, Segmented, T } from '../../src/ui.tsx';

type Result = { kind: 'password' | 'invite'; secret: string; emailed: boolean } | { kind: 'existing' };

/** Kullanıcı ekle: davet bağlantısı ya da geçici şifre, öğretmen kaydı, rol ve yetkiler */
export default function AddMember() {
  const path = useSchoolPath('members');
  const qc = useQueryClient();
  const teachers = useTeachers();
  const teacherList = (teachers.data ?? []).filter((t) => t.isActive !== false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState(true);
  const [password, setPassword] = useState('');
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [role, setRole] = useState<FormRole>('editor');
  const [permissions, setPermissions] = useState<Permission[]>(['announcements.manage']);
  const [result, setResult] = useState<Result | null>(null);

  const add = useMutation({
    mutationFn: () =>
      api<{ existingUser: boolean; invite: { inviteUrl: string; emailed: boolean } | null; password?: string }>(path, {
        method: 'POST',
        body: {
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          invite,
          // Boş bırakılırsa sunucu okunaklı bir geçici şifre üretir
          ...(!invite && password ? { password } : {}),
          ...apiRole(role, permissions),
          teacherId,
        },
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === 'members' });
      if (r.existingUser) setResult({ kind: 'existing' });
      else if (r.invite) setResult({ kind: 'invite', secret: r.invite.inviteUrl, emailed: r.invite.emailed });
      else setResult({ kind: 'password', secret: r.password ?? password, emailed: false });
    },
  });

  if (result) {
    return (
      <Screen back title="Kullanıcı eklendi" subtitle={fullName.trim()}>
        {result.kind === 'existing' ? (
          <Card style={{ gap: 10 }}>
            <T weight="700">{fullName.trim()} eklendi.</T>
            <T size={13.5} color={colors.muted}>
              Bu e-posta sistemde zaten kayıtlı olduğu için mevcut şifresi geçerli; kişi kendi şifresiyle bu okula da girer. Gerekirse kullanıcının sayfasından "Şifreyi sıfırla"yı kullanın.
            </T>
            <Button onPress={() => router.back()}>Tamam</Button>
          </Card>
        ) : (
          <AccessResult kind={result.kind} fullName={fullName.trim()} email={email.trim().toLowerCase()} secret={result.secret} emailed={result.emailed} onDone={() => router.back()} />
        )}
      </Screen>
    );
  }

  return (
    <Screen back title="Kullanıcı ekle">
      <Card style={{ gap: 12 }}>
        <Field
          label="Ad soyad"
          value={fullName}
          maxLength={80}
          onChangeText={(v) => {
            setFullName(v);
            // Ad kadrodaki bir öğretmenle aynıysa öğretmen kaydı kendiliğinden seçilir
            const match = matchTeacher(teacherList, v);
            if (match && !teacherId) setTeacherId(match.id);
          }}
        />
        <Field label="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <View style={{ gap: 6 }}>
          <T size={13} weight="700" color={colors.muted}>
            Giriş bilgisi
          </T>
          <Segmented
            value={invite ? 'invite' : 'password'}
            onChange={(v) => setInvite(v === 'invite')}
            options={[
              { value: 'invite', label: 'Davet gönder' },
              { value: 'password', label: 'Geçici şifre' },
            ]}
          />
          <T size={12} color={colors.faint}>
            {invite
              ? 'Kişiye bağlantı gider; şifresini kendisi belirler. E-posta sistemde kayıtlıysa mevcut şifresiyle girer.'
              : 'Kullanıcı ilk girişten sonra Hesabım\'dan değiştirebilir. E-posta sistemde kayıtlıysa mevcut şifresi geçerli kalır.'}
          </T>
        </View>
        {!invite && <Field label="Geçici şifre" value={password} onChangeText={setPassword} autoCapitalize="none" placeholder="Boş bırakılırsa otomatik üretilir" help="En az 8 karakter" />}
      </Card>

      <SectionTitle>Öğretmen kaydı</SectionTitle>
      <Card style={{ gap: 8 }}>
        <TeacherPicker value={teacherId} teachers={teacherList} onChange={setTeacherId} />
        <T size={12.5} color={colors.muted}>
          Öğretmense seçin: mobil uygulamada kendi ders programını ve nöbetlerini görür, izin bildirebilir.
        </T>
      </Card>

      <SectionTitle>Rol ve yetkiler</SectionTitle>
      <Card style={{ gap: 12 }}>
        <RoleEditor role={role} permissions={permissions} onRole={setRole} onPermissions={setPermissions} />
      </Card>

      <ErrorNote error={add.error} />
      <Button
        icon={invite ? 'send-outline' : 'person-add-outline'}
        loading={add.isPending}
        disabled={fullName.trim().length < 2 || !email.includes('@') || (!invite && password.length > 0 && password.length < 8)}
        onPress={() => add.mutate()}
      >
        {invite ? 'Davet gönder' : 'Kullanıcıyı ekle'}
      </Button>
    </Screen>
  );
}
