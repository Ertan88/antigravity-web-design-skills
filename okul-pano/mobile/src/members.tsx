import { normalizeName } from '@okulpano/shared/teachers';
import { useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useAuth } from './auth.tsx';
import { Sheet } from './sheet.tsx';
import { Text, TextInput } from './text.tsx';
import { colors, radius } from './theme.ts';
import { Button, Card, Icon, T } from './ui.tsx';

/* Kişiler ve yetkiler: öğretmen kaydı seçimi ve giriş bilgileri/davet sonucu (ekranlar app/kullanicilar, app/kullanici/[id], app/hesap-ac) */

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
        <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 8, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
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
