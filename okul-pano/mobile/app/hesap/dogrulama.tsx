import { errorText } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Share, View } from 'react-native';
import { AccountCard } from '../../src/accountCard.tsx';
import { adoptAccessToken, api } from '../../src/api.ts';
import { useAuth } from '../../src/auth.tsx';
import { Text } from '../../src/text.tsx';
import { colors } from '../../src/theme.ts';
import { Banner, Button, Card, Field, Loading, Screen, T } from '../../src/ui.tsx';
import { useSecurity } from '../../src/security.ts';

/**
 * İki adımlı doğrulama (1C). Kurulum: şifre → anahtarı doğrulayıcı uygulamaya ekle (aynı telefonda QR okutulamaz;
 * "Uygulamada aç" ya da anahtarı elle girme) → 6 haneli kod → 10 yedek kod (bir kez gösterilir, paylaşılarak saklanır).
 */
export default function Dogrulama() {
  const { me, reloadMe } = useAuth();
  const sec = useSecurity();
  const qc = useQueryClient();
  const [step, setStep] = useState<'password' | 'key' | 'codes' | 'manage-codes' | 'disable' | null>(null);
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mfa = sec.data?.mfa;

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err, 'İşlem yapılamadı'));
    } finally {
      setBusy(false);
    }
  };
  const done = async () => {
    await reloadMe().catch(() => undefined);
    // Doğrulama açılmadan önce reddedilen (platform) istekler yeni anahtarla yeniden çekilir; eski uyarı ekranda kalmaz
    await qc.invalidateQueries();
    setCodes([]);
    setStep(null);
    router.back();
  };
  const shareCodes = () => void Share.share({ message: `Okul Yayın · iki adımlı doğrulama yedek kodları\nHer biri bir kez çalışır.\n\n${codes.join('\n')}` });

  if (!mfa) return <Screen back title="İki adımlı doğrulama"><Loading /></Screen>;

  // Yedek kodlar (kurulum sonu ya da yenileme)
  if (codes.length) {
    return (
      <Screen
        back
        title="Yedek kodlarınız"
        footer={
          <>
            <Button variant="secondary" icon="share-outline" onPress={shareCodes}>
              Paylaş ya da kaydet
            </Button>
            <Button size="lg" onPress={() => void done()}>
              Kaydettim
            </Button>
          </>
        }
      >
        <T color={colors.muted}>Telefonunuz kaybolursa bunlarla girersiniz. Her biri bir kez çalışır ve bir daha gösterilmez; güvenli bir yere kaydedin.</T>
        <Card style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
          {codes.map((c) => (
            <Text key={c} selectable style={{ width: '50%', fontFamily: 'monospace', fontSize: 16, fontWeight: '700', color: colors.ink }}>
              {c}
            </Text>
          ))}
        </Card>
      </Screen>
    );
  }

  if (mfa.enabled) {
    const action = step === 'manage-codes' || step === 'disable' ? step : null;
    return (
      <Screen
        back
        title="İki adımlı doğrulama"
        footer={
          action ? (
            <>
              {error && (
                <T size={13} weight="600" color={colors.danger} style={{ textAlign: 'center' }}>
                  {error}
                </T>
              )}
              <Button
                size="lg"
                variant={action === 'disable' ? 'danger' : 'primary'}
                loading={busy}
                disabled={!password}
                onPress={() =>
                  void go(async () => {
                    if (action === 'manage-codes') {
                      const res = await api<{ recoveryCodes: string[] }>('/api/me/mfa/recovery-codes', { method: 'POST', body: { password } });
                      setCodes(res.recoveryCodes);
                    } else {
                      await api('/api/me/mfa/disable', { method: 'POST', body: { password } });
                      await done();
                    }
                    setPassword('');
                  })
                }
              >
                {action === 'disable' ? 'Doğrulamayı kapat' : 'Yeni kodlar oluştur'}
              </Button>
            </>
          ) : undefined
        }
      >
        <AccountCard />
        <Banner icon="shield-checkmark-outline" tone="primary" title="Açık" text={`Girişte şifreden sonra doğrulayıcı uygulamadaki kod istenir. ${mfa.recoveryLeft} yedek kodunuz kaldı.`} />
        {action ? (
          <>
            <T color={colors.muted}>{action === 'disable' ? 'Kapatınca girişte yalnızca şifre istenir; hatırlanan cihazlar da unutulur.' : 'Eski yedek kodların hepsi geçersiz olur.'}</T>
            <Field label="Şifre" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" autoFocus />
          </>
        ) : (
          <View style={{ gap: 10 }}>
            <Button variant="secondary" icon="key-outline" onPress={() => setStep('manage-codes')}>
              Yeni yedek kodlar
            </Button>
            {mfa.required ? (
              <T size={12} color={colors.muted}>
                Platform hesabında iki adımlı doğrulama kapatılamaz.
              </T>
            ) : (
              <Button variant="delete" onPress={() => setStep('disable')}>
                Doğrulamayı kapat
              </Button>
            )}
          </View>
        )}
      </Screen>
    );
  }

  // Kurulum
  const onKey = step === 'key' && setup;
  return (
    <Screen
      back
      title="İki adımlı doğrulamayı aç"
      footer={
        <>
          {error && (
            <T size={13} weight="600" color={colors.danger} style={{ textAlign: 'center' }}>
              {error}
            </T>
          )}
          <Button
            size="lg"
            loading={busy}
            disabled={onKey ? code.length !== 6 : !password}
            onPress={() =>
              void go(async () => {
                if (onKey) {
                  const res = await api<{ recoveryCodes: string[]; accessToken: string }>('/api/me/mfa/enable', { method: 'POST', body: { code } });
                  await adoptAccessToken(res.accessToken);
                  setCodes(res.recoveryCodes);
                } else {
                  setSetup(await api<{ secret: string; otpauthUrl: string }>('/api/me/mfa/setup', { method: 'POST', body: { password } }));
                  setPassword('');
                  setStep('key');
                }
              })
            }
          >
            {onKey ? 'Doğrula ve aç' : 'Devam et'}
          </Button>
        </>
      }
    >
      <AccountCard />
      {me?.user.mfaRequired && <Banner icon="shield-checkmark-outline" tone="warning" title="Platform hesabında zorunlu" text="Açana kadar platform ekranları kapalı kalır." />}
      {onKey ? (
        <>
          <T color={colors.muted}>1. Doğrulayıcı uygulamayı kurun (Google Authenticator, Microsoft Authenticator vb.).{'\n'}2. Anahtarı uygulamaya ekleyin.{'\n'}3. Uygulamadaki 6 haneli kodu yazın.</T>
          <Button variant="secondary" icon="open" onPress={() => void Linking.openURL(setup.otpauthUrl).catch(() => setError('Doğrulayıcı uygulama bulunamadı. Anahtarı elle girin.'))}>
            Doğrulayıcı uygulamada aç
          </Button>
          <Card style={{ gap: 6 }}>
            <T size={12} color={colors.muted} weight="700">
              ANAHTAR (ELLE GİRMEK İÇİN)
            </T>
            <Text selectable style={{ fontFamily: 'monospace', fontSize: 15, color: colors.ink }}>
              {setup.secret.match(/.{1,4}/g)?.join(' ')}
            </Text>
          </Card>
          <Field
            label="Kod"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            placeholder="123456"
            style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
          />
        </>
      ) : (
        <>
          <T color={colors.muted}>Girişte şifreden sonra doğrulayıcı uygulamadaki 6 haneli kod istenir. İsterseniz telefonunuz 30 gün hatırlanır. Başlamak için bu hesabın şifresini girin.</T>
          <Field label="Şifre" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
        </>
      )}
    </Screen>
  );
}
