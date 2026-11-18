import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { AuthField, AuthScaffold, FormError } from '../auth/AuthScaffold';
import { toAuthError } from '../auth/errors';
import { STORAGE_KEY, useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { ToggleRow } from '../ui/form';
import { Icon } from '../ui/icons';
import { AppText, IconButton, Surface } from '../ui/primitives';

/**
 * Hesabı kalıcı olarak silme (Google Play ve App Store zorunluluğu).
 * Silinenler: Firebase hesabı, buluttaki yedek, bu cihazdaki tüm PayFlow verileri.
 */
export default function DeleteAccountScreen() {
  const { palette } = useTheme();
  const { user, service } = useAuth();
  const { dispatch } = useStore();
  const [password, setPassword] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsPassword = user?.provider === 'password';

  const submit = async () => {
    setError(null);
    setPasswordError(null);
    if (!understood) return setError('Devam etmek için onay kutusunu işaretle.');
    if (needsPassword && !password) return setPasswordError('Şifreni gir');
    if (!service) return;
    setBusy(true);
    try {
      await service.deleteAccount(needsPassword ? password : undefined);
      dispatch({ type: 'reset' });
      await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    } catch (e) {
      const a = toAuthError(e);
      if (a.field === 'password') setPasswordError('Şifre hatalı.');
      else setError(a.message);
      setBusy(false);
    }
  };

  return (
    <AuthScaffold>
      <IconButton icon="back" label="Geri" onPress={() => router.back()} />
      <View style={{ gap: 6 }}>
        <AppText variant="display" accessibilityRole="header" style={{ fontSize: 28 }}>
          Hesabımı sil
        </AppText>
        <AppText variant="body" muted>
          {user?.email}
        </AppText>
      </View>

      <Surface style={{ padding: 16, gap: 10 }}>
        <AppText variant="bodyStrong">Kalıcı olarak silinecekler</AppText>
        {['PayFlow hesabın ve giriş bilgilerin', 'Buluttaki yedeğin (kartlar, faturalar, harcamalar, ödemeler)', 'Bu telefondaki tüm PayFlow verileri ve hatırlatmalar'].map((t) => (
          <View key={t} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="close" size={16} color={palette.danger} strokeWidth={2.4} />
            <AppText variant="label" style={{ flex: 1, fontFamily: fonts.body }}>
              {t}
            </AppText>
          </View>
        ))}
        <AppText variant="caption" muted>
          Bu işlem geri alınamaz. Verilerini saklamak istersen önce Raporlar'dan PDF veya Excel olarak dışa aktar.
        </AppText>
      </Surface>

      {needsPassword ? (
        <AuthField label="Şifren" secure autoComplete="password" value={password} onChangeText={setPassword} error={passwordError} />
      ) : (
        <AppText variant="caption" muted>
          Google ile giriş yaptın. Güvenlik nedeniyle hata alırsan çıkış yapıp tekrar giriş yap, ardından hemen sil.
        </AppText>
      )}

      <ToggleRow title="Bunun geri alınamayacağını anlıyorum" value={understood} onChange={setUnderstood} />
      <FormError message={error} />

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={submit}
        style={({ pressed }) => ({ height: 54, borderRadius: 16, backgroundColor: palette.danger, alignItems: 'center', justifyContent: 'center', opacity: pressed || busy ? 0.7 : 1 })}
      >
        <AppText variant="heading" color="#FFFFFF">
          {busy ? 'Siliniyor…' : 'Hesabımı kalıcı olarak sil'}
        </AppText>
      </Pressable>
    </AuthScaffold>
  );
}
