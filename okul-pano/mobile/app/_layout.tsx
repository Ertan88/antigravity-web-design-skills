import { QueryClient, QueryClientProvider, useIsFetching } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack, usePathname, useSegments } from 'expo-router';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { Text } from '../src/text.tsx';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth.tsx';
import { registerForPush } from '../src/push.ts';
import { colors } from '../src/theme.ts';
import { ThemeProvider, useThemeMode } from '../src/themeMode.tsx';

/** Açılış ekranı en az bu kadar görünür; ilerleme çubuğu bu sürede dolar */
const SPLASH_MIN_MS = 2400;
/** İlk ekranın verisi bundan uzun sürerse açılış ekranı yine kapanır */
const SPLASH_MAX_MS = 8000;

/**
 * Açılış ekranı: marka renginde logo, yazı logosu, slogan ve ilerleme çubuğu. Sistemin açılış ekranından
 * sonra görünür; arkada ilk ekran verisini yüklerken çubuk dolar, bitince ekran yumuşakça kaybolur.
 */
function BrandSplash({ finishing, onHidden }: { finishing: boolean; onHidden: () => void }) {
  const fill = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: 0.9, duration: SPLASH_MIN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [fill]);
  useEffect(() => {
    if (!finishing) return;
    Animated.sequence([
      Animated.timing(fill, { toValue: 1, duration: 250, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: false }),
    ]).start(() => onHidden());
  }, [finishing, fill, opacity, onHidden]);
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity, backgroundColor: '#0E5E66', alignItems: 'center', justifyContent: 'center', padding: 32 }]}
    >
      <StatusBar style="light" />
      <Image source={require('../assets/splash-icon.png')} style={{ width: 150, height: 150 }} accessibilityIgnoresInvertColors />
      <Text style={{ marginTop: 12, fontSize: 38, fontWeight: '800', letterSpacing: -1, color: '#FFFFFF' }}>
        okul<Text style={{ color: '#F5B83D' }}>yayın</Text>
      </Text>
      <Text style={{ marginTop: 10, fontSize: 17, fontWeight: '600', color: '#FFFFFF', opacity: 0.9, textAlign: 'center' }}>
        Okulunuzun Her Anı, Tek Ekranda
      </Text>
      <Text style={{ marginTop: 28, fontSize: 14, color: '#FFFFFF', opacity: 0.75 }}>Yükleniyor…</Text>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Yükleniyor"
        style={{ marginTop: 10, width: 220, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}
      >
        <Animated.View
          style={{
            height: '100%',
            borderRadius: 3,
            backgroundColor: '#F5B83D',
            width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }}
        />
      </View>
    </Animated.View>
  );
}

/** Oturum yoksa giriş ekranına, varsa uygulamaya yönlendirir; telefon bildirimlerini kaydeder */
function Gate({ fontsReady }: { fontsReady: boolean }) {
  const { status, school } = useAuth();
  const theme = useThemeMode();
  const pathname = usePathname();
  const segments = useSegments();
  const onLogin = segments[0] === 'login';
  // Açılış ekranı en az SPLASH_MIN_MS görünür; arkada ilk ekranın verisi yüklenir (sonra yuvarlak simge görünmesin)
  const fetching = useIsFetching();
  const [minDone, setMinDone] = useState(false);
  const [maxDone, setMaxDone] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setMinDone(true), SPLASH_MIN_MS);
    const b = setTimeout(() => setMaxDone(true), SPLASH_MAX_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const splashFinishing = status !== 'loading' && fontsReady && minDone && (fetching === 0 || maxDone);
  const hideSplash = useRef(() => setSplashHidden(true)).current;

  useEffect(() => {
    if (status === 'signedOut' && !onLogin) router.replace('/login');
    if (status === 'signedIn' && onLogin) router.replace('/');
  }, [status, onLogin]);

  useEffect(() => {
    if (status === 'signedIn') void registerForPush().catch(() => undefined);
  }, [status, school?.id]);

  // Bildirime dokununca ilgili ekran açılır (ör. onay bekleyen duyuru → Onaylar)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = (r.notification.request.content.data as { url?: string } | undefined)?.url;
      if (url) router.push(url as never);
    });
    return () => sub.remove();
  }, []);

  // Tema değişince ekranlar yeniden kurulur; değiştirildiği ekrana (Menü) geri dönülür
  useEffect(() => {
    if (!theme.returnTo) return;
    const to = theme.returnTo;
    theme.clearReturn();
    if (to !== pathname) setTimeout(() => router.push(to as never), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.key]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {status !== 'loading' && fontsReady && (
        <Stack key={theme.key} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="duyuru-yeni" options={{ presentation: 'modal' }} />
          <Stack.Screen name="izin" options={{ presentation: 'modal' }} />
        </Stack>
      )}
      {!splashHidden && <BrandSplash finishing={splashFinishing} onHidden={hideSplash} />}
    </View>
  );
}

export default function RootLayout() {
  // Yazı tipi yüklenemezse (ör. bozuk dosya) uygulama sistem yazı tipiyle açılır
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const pathname = usePathname();
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } }));
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ThemeProvider pathname={pathname}>
            <Gate fontsReady={fontsLoaded || Boolean(fontError)} />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
