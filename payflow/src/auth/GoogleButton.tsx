import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { googleClientIds, isGoogleConfigured } from '../config/env';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from '../ui/primitives';
import { useAuth } from './AuthProvider';
import { toAuthError } from './errors';

WebBrowser.maybeCompleteAuthSession();

function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

function ButtonShell({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 52,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: palette.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        opacity: pressed || busy ? 0.7 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={palette.text} /> : <GoogleLogo />}
      <AppText variant="bodyStrong">{label}</AppText>
    </Pressable>
  );
}

/** Google ile giriş/kayıt. İstemci kimlikleri yoksa nasıl açılacağını anlatır. */
export function GoogleButton({ label = 'Google ile devam et' }: { label?: string }) {
  const { service } = useAuth();
  if (!service || !isGoogleConfigured()) {
    return (
      <ButtonShell
        label={label}
        onPress={() =>
          Alert.alert(
            'Google ile giriş henüz açık değil',
            'Firebase projesine Google girişi eklenip istemci kimlikleri .env dosyasına girildiğinde bu düğme çalışır. Şimdilik e-posta ile kayıt olabilir veya hesapsız devam edebilirsin.',
          )
        }
      />
    );
  }
  return <ConfiguredGoogleButton label={label} />;
}

function ConfiguredGoogleButton({ label }: { label: string }) {
  const { service } = useAuth();
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: googleClientIds.webClientId,
    iosClientId: googleClientIds.iosClientId || undefined,
    androidClientId: googleClientIds.androidClientId || undefined,
  });

  useEffect(() => {
    if (response?.type !== 'success') {
      if (response) setBusy(false);
      return;
    }
    const idToken = response.params.id_token;
    if (!idToken || !service) return;
    service.signInWithGoogleIdToken(idToken).catch((e) => {
      setBusy(false);
      Alert.alert('Google ile giriş yapılamadı', toAuthError(e).message);
    });
  }, [response, service]);

  return (
    <View>
      <ButtonShell
        label={label}
        busy={busy || !request}
        onPress={() => {
          setBusy(true);
          promptAsync().catch(() => setBusy(false));
        }}
      />
    </View>
  );
}
