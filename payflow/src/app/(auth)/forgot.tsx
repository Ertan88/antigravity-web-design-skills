import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { AuthField, AuthScaffold, FormError } from '../../auth/AuthScaffold';
import { isValidEmail, toAuthError } from '../../auth/errors';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../ui/icons';
import { AppText, IconButton, PrimaryButton, Surface } from '../../ui/primitives';

export default function ForgotScreen() {
  const { palette } = useTheme();
  const { service } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isValidEmail(email)) return setError('Geçerli bir e-posta gir');
    if (!service) return;
    setBusy(true);
    try {
      await service.resetPassword(email);
      setSent(true);
    } catch (e) {
      const a = toAuthError(e);
      // Hesap var/yok bilgisini sızdırmamak için "kullanıcı yok" durumunda da başarı göster.
      if (a.field === 'password') setSent(true);
      else setError(a.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScaffold>
      <IconButton icon="back" label="Geri" onPress={() => router.back()} />
      <View style={{ gap: 6 }}>
        <AppText variant="display" accessibilityRole="header" style={{ fontSize: 30 }}>
          Şifreni sıfırla
        </AppText>
        <AppText variant="body" muted>
          E-posta adresine bir sıfırlama bağlantısı gönderelim.
        </AppText>
      </View>
      {sent ? (
        <Surface style={{ padding: 16, gap: 8 }}>
          <Icon name="check" size={22} color={palette.accent} strokeWidth={2.4} />
          <AppText variant="bodyStrong">Bağlantı gönderildi</AppText>
          <AppText variant="label" muted>
            Bu e-posta ile bir hesap varsa birkaç dakika içinde sıfırlama bağlantısı gelir. Gereksiz klasörünü de kontrol et.
          </AppText>
          <PrimaryButton title="Girişe dön" onPress={() => router.back()} />
        </Surface>
      ) : (
        <View style={{ gap: 12 }}>
          <AuthField label="E-posta" placeholder="ornek@mail.com" keyboardType="email-address" autoComplete="email" value={email} onChangeText={(t) => { setEmail(t); setError(null); }} />
          <FormError message={error} />
          <PrimaryButton title={busy ? 'Gönderiliyor…' : 'Bağlantı gönder'} onPress={submit} />
        </View>
      )}
    </AuthScaffold>
  );
}
