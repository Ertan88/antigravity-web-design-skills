import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { AuthField, AuthScaffold, FormError, OrDivider } from '../../auth/AuthScaffold';
import { isValidEmail, toAuthError } from '../../auth/errors';
import { GoogleButton } from '../../auth/GoogleButton';
import { passwordStrength } from '../../core/password';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts } from '../../theme/tokens';
import { AppText, IconButton, PrimaryButton } from '../../ui/primitives';

export default function RegisterScreen() {
  const { palette } = useTheme();
  const { service } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [kvkk, setKvkk] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = passwordStrength(password);
  const meterColor = strength.score >= 4 ? palette.accent : strength.score >= 2 ? palette.warn : palette.danger;

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Adını gir';
    if (!isValidEmail(email)) e.email = 'Geçerli bir e-posta gir';
    if (password.length < 8) e.password = 'Şifre en az 8 karakter olmalı';
    else if (strength.score < 2) e.password = 'Daha güçlü bir şifre seç';
    if (confirm !== password) e.confirm = 'Şifreler eşleşmiyor';
    if (!kvkk) e.kvkk = 'Devam etmek için KVKK metnini onaylamalısın';
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length || !service) return;
    setBusy(true);
    try {
      await service.register(name, email, password);
    } catch (err) {
      const a = toAuthError(err);
      if (a.field) setErrors({ [a.field]: a.message });
      else setFormError(a.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScaffold>
      <IconButton icon="back" label="Geri" onPress={() => router.back()} />
      <View style={{ gap: 6 }}>
        <AppText variant="display" accessibilityRole="header" style={{ fontSize: 30 }}>
          Hesap oluştur
        </AppText>
        <AppText variant="body" muted>
          30 saniye sürer. Banka şifren asla istenmez.
        </AppText>
      </View>

      <View style={{ gap: 12 }}>
        <AuthField label="Ad Soyad" placeholder="Adın ve soyadın" autoCapitalize="words" autoComplete="name" value={name} onChangeText={setName} error={errors.name} />
        <AuthField label="E-posta" placeholder="ornek@mail.com" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} error={errors.email} />
        <AuthField label="Şifre" secure autoComplete="new-password" textContentType="newPassword" value={password} onChangeText={setPassword} error={errors.password} />
        {password ? (
          <View style={{ gap: 6 }} accessible accessibilityLabel={`Şifre gücü: ${strength.label}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>
                {[1, 2, 3, 4].map((i) => (
                  <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= strength.score ? meterColor : palette.surface2 }} />
                ))}
              </View>
              <AppText variant="caption" color={meterColor} style={{ fontFamily: fonts.bodyBold }}>
                {strength.label}
              </AppText>
            </View>
            {strength.hint ? (
              <AppText variant="caption" muted>
                {strength.hint}
              </AppText>
            ) : null}
          </View>
        ) : null}
        <AuthField label="Şifre tekrar" secure autoComplete="new-password" value={confirm} onChangeText={setConfirm} error={errors.confirm} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch accessibilityLabel="KVKK Aydınlatma Metni'ni okudum, kabul ediyorum" value={kvkk} onValueChange={setKvkk} trackColor={{ true: palette.button, false: palette.surface2 }} thumbColor="#FFFFFF" />
          <AppText variant="label" muted style={{ flex: 1, fontFamily: fonts.body }}>
            <AppText variant="label" color={palette.accent}>
              KVKK Aydınlatma Metni
            </AppText>
            'ni okudum, kabul ediyorum.
          </AppText>
        </View>
        {errors.kvkk ? (
          <AppText variant="caption" color={palette.danger}>
            {errors.kvkk}
          </AppText>
        ) : null}

        <FormError message={formError} />
        <PrimaryButton title={busy ? 'Hesap oluşturuluyor…' : 'Hesabı oluştur'} onPress={submit} />
      </View>

      <OrDivider />
      <GoogleButton label="Google ile kayıt ol" />

      <View style={{ marginTop: 'auto', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <AppText variant="body" muted>
          Zaten hesabın var mı?
        </AppText>
        <Link href="/login" asChild>
          <Pressable accessibilityRole="link" hitSlop={8}>
            <AppText variant="bodyStrong" color={palette.accent}>
              Giriş yap
            </AppText>
          </Pressable>
        </Link>
      </View>
    </AuthScaffold>
  );
}
