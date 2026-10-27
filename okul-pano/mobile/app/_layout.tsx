import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth.tsx';
import { registerForPush } from '../src/push.ts';
import { colors } from '../src/theme.ts';

const SPLASH_MIN_MS = 1500;

/** Açılış ekranı: marka renginde logo, yazı logosu ve slogan (sistemin açılış ekranından sonra kısa süre görünür) */
function BrandSplash() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0E5E66', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <StatusBar style="light" />
      <Image source={require('../assets/splash-icon.png')} style={{ width: 150, height: 150 }} accessibilityIgnoresInvertColors />
      <Text style={{ marginTop: 12, fontSize: 38, fontWeight: '800', letterSpacing: -1, color: '#FFFFFF' }}>
        okul<Text style={{ color: '#F5B83D' }}>yayın</Text>
      </Text>
      <Text style={{ marginTop: 10, fontSize: 17, fontWeight: '600', color: '#FFFFFF', opacity: 0.9, textAlign: 'center' }}>
        Okulunuzun Her Anı, Tek Ekranda
      </Text>
    </View>
  );
}

/** Oturum yoksa giriş ekranına, varsa uygulamaya yönlendirir; telefon bildirimlerini kaydeder */
function Gate() {
  const { status, school } = useAuth();
  const segments = useSegments();
  const onLogin = segments[0] === 'login';
  // Açılış ekranı en az kısa bir süre görünür; oturum yüklenene kadar da kalır
  const [minShown, setMinShown] = useState(Platform.OS === 'web');
  useEffect(() => {
    const t = setTimeout(() => setMinShown(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Yönlendirme, gezinti yığını açılış ekranından sonra kurulunca yapılır
    if (!minShown) return;
    if (status === 'signedOut' && !onLogin) router.replace('/login');
    if (status === 'signedIn' && onLogin) router.replace('/');
  }, [status, onLogin, minShown]);

  useEffect(() => {
    if (status === 'signedIn') void registerForPush();
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

  if (status === 'loading' || !minShown) return <BrandSplash />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="duyuru-yeni" options={{ presentation: 'modal' }} />
      <Stack.Screen name="izin" options={{ presentation: 'modal' }} />
    </Stack>
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
