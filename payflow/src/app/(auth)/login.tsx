import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { AuthField, AuthScaffold, BrandMark, FormError, OrDivider } from '../../auth/AuthScaffold';
import { isValidEmail, toAuthError } from '../../auth/errors';
import { GoogleButton } from '../../auth/GoogleButton';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts } from '../../theme/tokens';
import { AppText, PrimaryButton, Surface } from '../../ui/primitives';

export default function LoginScreen() {
  const { palette } = useTheme();
  const { service, available, continueAsGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: typeof errors = {};
    if (!isValidEmail(email)) e.email = 'Geçerli bir e-posta gir';
    if (!password) e.password = 'Şifreni gir';
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length || !service) return;
    setBusy(true);
    try {
      await service.signIn(email, password);
    } catch (err) {
      const a = toAuthError(err);
      if (a.field === 'email' || a.field === 'password') setErrors({ [a.field]: a.message });
      else setFormError(a.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScaffold>
      <BrandMark />
      <View style={{ gap: 6 }}>
        <AppText variant="display" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 34 }}>
          Ödemelerin akışta,{'\n'}aklın rahat.
        </AppText>
        <AppText variant="body" muted>
          Faturalar, kartlar ve harcamalar tek akışta.
        </AppText>
      </View>

      {available ? (
        <>
          <View style={{ gap: 12 }}>
            <AuthField label="E-posta" placeholder="ornek@mail.com" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" value={email} onChangeText={setEmail} error={errors.email} />
            <AuthField label="Şifre" secure autoComplete="password" textContentType="password" value={password} onChangeText={setPassword} error={errors.password} onSubmitEditing={submit} />
            <Link href="/forgot" asChild>
              <Pressable accessibilityRole="link" hitSlop={8} style={{ alignSelf: 'flex-end' }}>
                <AppText variant="label" color={palette.accent}>
                  Şifremi unuttum
                </AppText>
              </Pressable>
            </Link>
            <FormError message={formError} />
            <PrimaryButton title={busy ? 'Giriş yapılıyor…' : 'Giriş yap'} onPress={submit} />
          </View>
          <OrDivider />
          <GoogleButton />
        </>
      ) : (
        <Surface style={{ padding: 16, gap: 6 }}>
          <AppText variant="bodyStrong">Hesap sistemi henüz bağlanmadı</AppText>
          <AppText variant="label" muted style={{ fontFamily: fonts.body }}>
            Firebase ayarları girildiğinde e-posta ve Google ile giriş açılır. Şimdilik verilerin yalnızca bu cihazda tutularak devam edebilirsin.
          </AppText>
        </Surface>
      )}

      <Pressable accessibilityRole="button" onPress={continueAsGuest} style={{ alignItems: 'center', paddingVertical: 8 }}>
        <AppText variant="label" color={available ? palette.muted : palette.accent} style={{ fontFamily: fonts.bodyBold }}>
          Hesapsız devam et
        </AppText>
        <AppText variant="caption" muted>
          Verilerin sadece bu cihazda kalır
        </AppText>
      </Pressable>

      {available ? (
        <View style={{ marginTop: 'auto', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <AppText variant="body" muted>
            Hesabın yok mu?
          </AppText>
          <Link href="/register" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <AppText variant="bodyStrong" color={palette.accent}>
                Kayıt ol
              </AppText>
            </Pressable>
          </Link>
        </View>
      ) : null}
    </AuthScaffold>
  );
}
