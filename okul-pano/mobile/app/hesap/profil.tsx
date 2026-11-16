import { errorText } from '@okulpano/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { api } from '../../src/api.ts';
import { useAuth } from '../../src/auth.tsx';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, Field, ListRow, Screen, T } from '../../src/ui.tsx';
import { mutePush, PUSH_TEXT, pushStatus, registerForPush, type PushState } from '../../src/push.ts';

/** Hesabım: ad soyad ve e-posta (e-posta değişikliği mevcut şifreyle onaylanır); şifre değiştirme buradan açılır. */
export default function Profil() {
  const [push, setPush] = useState<PushState | 'error' | null>(null);
  // Sayfaya her girişte telefonun gerçek izin durumu okunur
  useEffect(() => {
    void pushStatus().then(setPush).catch(() => undefined);
  }, []);
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
      setMessage({ ok: false, text: errorText(err, 'Kaydedilemedi') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title="Hesabım"
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
      <Card style={{ paddingVertical: 4, gap: 0, marginTop: 8 }}>
        <ListRow tile={{ icon: 'lock-closed-outline', tone: 'lilac' }} title="Şifre değiştir" subtitle="Diğer cihazlardaki oturumlar kapanır" onPress={() => router.push('/hesap/sifre')} last={Platform.OS === 'web'} />
        {Platform.OS !== 'web' && (
          <ListRow
            tile={{ icon: 'phone-portrait-outline', tone: 'sky' }}
            title="Telefon bildirimleri"
            subtitle={push === 'error' ? 'Kaydedilemedi: internet bağlantınızı kontrol edip yeniden deneyin.' : push ? PUSH_TEXT[push] : undefined}
            right={push === 'ok' || push === 'local' ? <Badge tone="success">Açık</Badge> : push === 'off' || push === 'denied' ? <Badge tone="warning">Kapalı</Badge> : undefined}
            // Açıkken dokunmak kapatır, kapalıyken açar
            onPress={() =>
              void (push === 'ok' || push === 'local' ? mutePush().then(() => setPush('off')) : registerForPush().then((r) => setPush(r === 'denied' ? 'denied' : r))).catch(() =>
                setPush('error'),
              )
            }
            last
          />
        )}
      </Card>
    </Screen>
  );
}
