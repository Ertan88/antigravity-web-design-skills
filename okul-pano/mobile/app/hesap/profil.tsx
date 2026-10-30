import { useState } from 'react';
import { api } from '../../src/api.ts';
import { useAuth } from '../../src/auth.tsx';
import { colors } from '../../src/theme.ts';
import { Button, Field, Screen, T } from '../../src/ui.tsx';

/** Profil bilgilerim: ad soyad ve e-posta. E-posta değişikliği mevcut şifreyle onaylanır. */
export default function Profil() {
  const { me, reloadMe } = useAuth();
  const [fullName, setFullName] = useState(me?.user.fullName ?? '');
  const [email, setEmail] = useState(me?.user.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const emailChanged = email.trim().toLowerCase() !== me?.user.email;

  const save = async () => {
    if (fullName.trim().length < 2) return setMessage({ ok: false, text: 'Ad soyad en az 2 harf olmalı.' });
    if (emailChanged && !password) return setMessage({ ok: false, text: 'E-postayı değiştirmek için mevcut şifrenizi girin.' });
    setBusy(true);
    setMessage(null);
    try {
      await api('/api/me', {
        method: 'PATCH',
        body: { fullName: fullName.trim(), ...(emailChanged ? { email: email.trim().toLowerCase(), currentPassword: password } : {}) },
      });
      await reloadMe();
      setPassword('');
      setMessage({ ok: true, text: emailChanged ? 'Kaydedildi. Bundan sonra yeni e-postanızla giriş yapın.' : 'Kaydedildi.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Kaydedilemedi' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title="Profil bilgilerim"
      footer={
        <>
          {message && (
            <T size={13} weight="600" color={message.ok ? colors.success : colors.danger} style={{ textAlign: 'center' }}>
              {message.text}
            </T>
          )}
          <Button size="lg" loading={busy} onPress={() => void save()}>
            Kaydet
          </Button>
        </>
      }
    >
      <Field label="Ad soyad" value={fullName} onChangeText={setFullName} maxLength={80} autoComplete="name" />
      <Field
        label="E-posta"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        maxLength={200}
        help="Girişte kullandığınız adres."
      />
      {emailChanged && (
        <Field
          label="Mevcut şifreniz"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          help="Hesabınızın güvenliği için e-posta değişikliğini şifrenizle onaylayın."
        />
      )}
    </Screen>
  );
}
