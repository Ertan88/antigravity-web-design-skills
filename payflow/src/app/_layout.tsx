import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold, useFonts as useInter } from '@expo-google-fonts/inter';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold, useFonts as useSpaceGrotesk } from '@expo-google-fonts/space-grotesk';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLock } from '../auth/AppLock';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { CloudSync } from '../auth/CloudSync';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { StoreProvider, useStore } from '../store/StoreProvider';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootStack() {
  const { palette, isDark } = useTheme();
  const { ready } = useStore();
  const { status } = useAuth();
  const loaded = ready && status !== 'loading';
  const inside = status === 'signedIn' || status === 'guest';

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AppLock>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
        <Stack.Protected guard={inside}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="card-new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="category-new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="card/[id]" />
          <Stack.Screen name="card-pay" options={{ presentation: 'modal' }} />
          <Stack.Screen name="simulator" />
          <Stack.Screen name="flow-settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="expenses" />
        </Stack.Protected>
        <Stack.Protected guard={!inside}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </AppLock>
  );
}

export default function RootLayout() {
  const [interLoaded] = useInter({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [groteskLoaded] = useSpaceGrotesk({ SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });

  if (!interLoaded || !groteskLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StoreProvider>
          <AuthProvider>
            <CloudSync>
              <NotificationsProvider>
                <RootStack />
              </NotificationsProvider>
            </CloudSync>
          </AuthProvider>
        </StoreProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
