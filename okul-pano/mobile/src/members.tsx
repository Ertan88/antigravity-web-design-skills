import { ADMIN_ONLY_PERMISSIONS, PERMISSION_KEYS, PERMISSIONS, type Permission } from '@okulpano/shared/permissions';
import { normalizeName } from '@okulpano/shared/teachers';
import { useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useAuth } from './auth.tsx';
import type { Member } from './data.ts';
import { Sheet } from './sheet.tsx';
import { Text, TextInput } from './text.tsx';
import { colors, radius } from './theme.ts';
import { Button, Card, Choice, Icon, T, ToggleRow } from './ui.tsx';

/*
 * Kullanıcılar ve yetkiler (panelle aynı kurallar): rehber öğretmen ayrı bir rol olarak seçilir (editör + bütün
 * gözlem kayıtlarını görme yetkisi); yönetici atamayı yalnızca okul sahibi yapar.
 */

export const GRANTABLE = PERMISSION_KEYS.filter((p) => !ADMIN_ONLY_PERMISSIONS.includes(p) && p !== 'conduct.counsel');
export type FormRole = 'admin' | 'editor' | 'counselor';
export const ROLE_INFO: Record<FormRole, { title: string; text: string }> = {
  editor: { title: 'Editör', text: 'Yalnızca aşağıda seçtiğiniz bölümleri düzenleyebilir.' },
  counselor: { title: 'Rehber öğretmen', text: 'Bütün öğrencilerin gözlem kayıtlarını ve ayın öğrencisi önerilerini görür; ayrıca seçtiğiniz bölümleri düzenler.' },
  admin: { title: 'Yönetici', text: 'Tüm bölümleri düzenler, kullanıcı ekler ve yetki verir.' },
};

/** Üyenin görünen rolü: rehber öğretmen yetkisi olan editör "Rehber öğretmen" */
export const formRole = (m: { role: string; permissions: string[] }): FormRole =>
  m.role === 'admin' ? 'admin' : m.permissions.includes('conduct.counsel') ? 'counselor' : 'editor';
export const roleTitle = (m: Member) => (m.role === 'owner' ? 'Okul sahibi' : ROLE_INFO[formRole(m)].title);

/** Formdaki rol API'deki role ve yetkilere çevrilir */
export const apiRole = (role: FormRole, permissions: Permission[]) =>
  role === 'admin'
    ? { role: 'admin' as const, permissions: [] as Permission[] }
    : { role: 'editor' as const, permissions: [...permissions.filter((p) => p !== 'conduct.counsel'), ...(role === 'counselor' ? (['conduct.counsel'] as Permission[]) : [])] };

/** Üyenin yetkileri kısaca: "Tüm yetkiler", "Yalnızca görüntüleme" ya da yetki adları */
export function permissionSummary(m: Member): string {
  if (m.role !== 'editor') return 'Tüm yetkiler';
  const list = m.effectivePermissions.filter((p) => p !== 'conduct.counsel');
  return list.length ? list.map((p) => PERMISSIONS[p]).join(', ') : 'Yalnızca görüntüleme';
}

/** Rol ve düzenleyebileceği bölümler */
export function RoleEditor({ role, permissions, onRole, onPermissions }: { role: FormRole; permissions: Permission[]; onRole: (r: FormRole) => void; onPermissions: (p: Permission[]) => void }) {
  const { role: myRole } = useAuth();
  const roles: FormRole[] = myRole === 'owner' ? ['editor', 'counselor', 'admin'] : ['editor', 'counselor'];
  return (
    <View style={{ gap: 10 }}>
      <Choice columns={1} value={role} onChange={onRole} options={roles.map((r) => ({ value: r, label: ROLE_INFO[r].title, description: ROLE_INFO[r].text }))} />
      {role !== 'admin' && (
        <View style={{ gap: 4 }}>
          <T size={13} weight="700" color={colors.muted}>
            Düzenleyebileceği bölümler
          </T>
          {GRANTABLE.map((p) => (
            <ToggleRow key={p} label={PERMISSIONS[p]} value={permissions.includes(p)} onChange={(on) => onPermissions(on ? [...permissions, p] : permissions.filter((x) => x !== p))} />
          ))}
        </View>
      )}
    </View>
  );
}

type TeacherOption = { id: string; fullName: string };

/** Ad soyad kadrodaki bir öğretmenle aynıysa o öğretmen kaydı */
export const matchTeacher = (teachers: TeacherOption[], name: string) => teachers.find((t) => normalizeName(t.fullName) === normalizeName(name)) ?? null;

/** Öğretmen kaydı seçimi: dokununca aranabilir liste açılır */
export function TeacherPicker({ value, teachers, onChange, disabled }: { value: string | null; teachers: TeacherOption[]; onChange: (id: string | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = teachers.find((t) => t.id === value);
  const needle = normalizeName(query);
  const list = teachers.filter((t) => !needle || normalizeName(t.fullName).includes(needle));
  const pick = (id: string | null) => {
    setOpen(false);
    setQuery('');
    if (id !== value) onChange(id);
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Öğretmen kaydı"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card, paddingHorizontal: 14, opacity: disabled ? 0.5 : 1 }}
      >
        <Icon name="school-outline" size={18} color={colors.muted} />
        <Text style={{ flex: 1, fontSize: 15, color: current ? colors.ink : colors.subtle }} numberOfLines={1}>
          {current?.fullName ?? 'Öğretmen değil'}
        </Text>
        <Icon name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>Öğretmen kaydı</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Ad soyad ara"
          placeholderTextColor={colors.subtle}
          style={{ marginTop: 10, height: 46, flexShrink: 0, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 14, fontSize: 15, color: colors.ink, backgroundColor: colors.card }}
        />
        <ScrollView style={{ marginTop: 8 }} keyboardShouldPersistTaps="handled">
          {[{ id: null as string | null, fullName: 'Öğretmen değil' }, ...list].map((t) => {
            const on = t.id === value;
            return (
              <Pressable key={t.id ?? '_'} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => pick(t.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: on ? '800' : '500', color: t.id ? colors.ink : colors.muted }}>{t.fullName}</Text>
                {on && <Icon name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
}

/** Giriş bilgileri ya da davet bağlantısı: ekranda gösterilir, paylaşılabilir */
export function AccessResult({ kind, fullName, email, secret, emailed, onDone }: { kind: 'password' | 'invite'; fullName: string; email: string; secret: string; emailed: boolean; onDone: () => void }) {
  const { school, server } = useAuth();
  const panel = `${server.replace(/\/$/, '')}/admin/`;
  const message =
    kind === 'password'
      ? `Merhaba ${fullName},\n\n${school?.name ?? ''} Okulyayın giriş bilgileriniz:\n\nAdres: ${panel}\nE-posta: ${email}\nŞifre: ${secret}\n\nMobil uygulamaya da aynı bilgilerle girebilirsiniz. Giriş yaptıktan sonra Hesabım'dan şifrenizi değiştirin.`
      : `Merhaba ${fullName},\n\n${school?.name ?? ''} sizi Okulyayın'a davet etti. Şifrenizi belirlemek için bağlantıyı açın (7 gün geçerli):\n${secret}\n\nMobil uygulamaya da aynı e-posta ve şifreyle girebilirsiniz.`;
  return (
    <Card style={{ gap: 10 }}>
      <T weight="800" size={16}>
        {kind === 'password' ? 'Giriş bilgileri' : 'Davet'}
      </T>
      <T size={13.5} color={emailed ? colors.success : colors.muted} weight={emailed ? '600' : '400'}>
        {emailed
          ? `${kind === 'password' ? 'Giriş bilgileri' : 'Davet'} ${email} adresine e-postayla gönderildi.`
          : kind === 'password'
            ? 'Bu bilgileri kullanıcıya güvenli bir yoldan iletin. Şifre bir daha gösterilmeyecek.'
            : 'E-posta gönderilemedi. Davet bağlantısını paylaşın.'}
      </T>
      {kind === 'password' && (
        <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: 12, gap: 2 }}>
          <T size={13.5}>E-posta: {email}</T>
          <T size={13.5} weight="800">
            Şifre: {secret}
          </T>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(!emailed || kind === 'password') && (
          <Button size="sm" variant="secondary" icon="share-outline" onPress={() => void Share.share({ message })} style={{ flex: 1 }}>
            Paylaş
          </Button>
        )}
        <Button size="sm" onPress={onDone} style={{ flex: 1 }}>
          Tamam
        </Button>
      </View>
    </Card>
  );
}
