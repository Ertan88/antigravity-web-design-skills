import { QueryClient, QueryClientProvider, useIsFetching } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth.tsx';
import { registerForPush } from '../src/push.ts';
import { colors } from '../src/theme.ts';

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
function Gate() {
  const { status, school } = useAuth();
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
  const splashFinishing = status !== 'loading' && minDone && (fetching === 0 || maxDone);
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

  return (
    <View style={{ flex: 1 }}>
      {status !== 'loading' && (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
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
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } }));
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <StatusBar style="dark" />
          <Gate />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
