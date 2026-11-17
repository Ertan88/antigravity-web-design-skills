import { errorText, schoolFullName } from '@okulpano/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { api, session } from '../../src/api.ts';
import { useAuth } from '../../src/auth.tsx';
import { colors } from '../../src/theme.ts';
import { Banner, Button, Card, Field, Screen, T } from '../../src/ui.tsx';

/**
 * Platform hesabını ayır (KVKK): platform yöneticisi bir okulda da çalışıyorsa platform yetkisi yeni bir e-postaya
 * taşınır. Bu hesap okul hesabı olarak kalır (okuldaki bütün kayıtlar yerinde); yeni platform hesabı bu telefonda
 * hesap listesine eklenir, Menü › Hesap değiştir ile şifresiz geçilir.
 */
export default function HesapAyir() {
  const { me, rememberAccount, setPlatformMode, reloadMe } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const own = (me?.schools ?? []).filter((s) => !s.support);

  const submit = async () => {
    setError(null);
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setError('Platform hesabı için geçerli bir e-posta yazın.');
    if (e === me?.user.email) return setError('Yeni e-posta bu hesabınkinden farklı olmalı.');
    if (password.length < 8) return setError('Şifre en az 8 karakter olmalı.');
    if (password !== again) return setError('Şifreler aynı değil.');
    if (!current) return setError('Mevcut şifrenizi yazın.');
    setBusy(true);
    try {
      await api('/api/platform/split', { method: 'POST', body: { email: e, password, currentPassword: current } });
      // Bu hesabın oturumu yenilenir (artık platform yetkisi yok) ve okul görünümüne geçilir
      await session.setTokens(null, session.refresh);
      await setPlatformMode(false);
      await reloadMe();
      // Yeni platform hesabı hesap listesine eklenir; giriş yapılamazsa kişi sonra şifresiyle ekler
      await rememberAccount(e, password).catch(() => undefined);
      router.replace('/');
    } catch (err) {
      setError(errorText(err, 'Hesap ayrılamadı'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title="Platform hesabını ayır"
      footer={
        <>
          {error && (
            <T size={13} weight="600" color={colors.danger} style={{ textAlign: 'center' }}>
              {error}
            </T>
          )}
          <Button size="lg" loading={busy} onPress={() => void submit()}>
            Hesabı ayır
          </Button>
        </>
      }
    >
      <Banner
        tone="warning"
        icon="shield-checkmark-outline"
        title="Platform ile okul ayrı hesaplarda olmalı (KVKK)"
        text={`Bu hesap ${own.map((s) => schoolFullName(s.name, s.schoolType)).join(', ') || 'okulunuzda'} okul hesabı olarak kalır; okuldaki kayıtlarınız yerinde durur. Platform yönetimi yeni e-postayla açılan hesaba geçer.`}
      />
      <Card style={{ gap: 12 }}>
        <Field label="Platform hesabının e-postası" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" autoCapitalize="none" />
        <Field label="Platform hesabının şifresi" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" help="En az 8 karakter." />
        <Field label="Şifre (tekrar)" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" />
      </Card>
      <Card style={{ gap: 12 }}>
        <Field label="Bu hesabın mevcut şifresi" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      </Card>
      <T size={12.5} color={colors.faint}>
        Ayırdıktan sonra iki hesap da bu telefonda kayıtlı olur. Menü › Hesap değiştir ile şifre sormadan geçersiniz.
      </T>
    </Screen>
  );
}
