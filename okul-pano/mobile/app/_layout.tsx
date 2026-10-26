import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth.tsx';
import { registerForPush } from '../src/push.ts';
import { Loading, Screen } from '../src/ui.tsx';
import { colors } from '../src/theme.ts';

/** Oturum yoksa giriş ekranına, varsa uygulamaya yönlendirir; telefon bildirimlerini kaydeder */
function Gate() {
  const { status, school } = useAuth();
  const segments = useSegments();
  const onLogin = segments[0] === 'login';

  useEffect(() => {
    if (status === 'signedOut' && !onLogin) router.replace('/login');
    if (status === 'signedIn' && onLogin) router.replace('/');
  }, [status, onLogin]);

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

  if (status === 'loading') {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
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
