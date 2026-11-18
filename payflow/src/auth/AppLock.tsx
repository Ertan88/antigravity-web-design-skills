import * as LocalAuthentication from 'expo-local-authentication';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AppState as RNAppState, View } from 'react-native';
import { useStore } from '../store/StoreProvider';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../ui/icons';
import { AppText, PrimaryButton } from '../ui/primitives';

const RELOCK_AFTER_MS = 60_000;

/** Face ID / parmak izi kilidi: açılışta ve 1 dk'dan uzun arka planda kalınca. */
export function AppLock({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const { palette } = useTheme();
  const enabled = !!state.settings.appLock;
  const [locked, setLocked] = useState(enabled);
  const backgroundAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'PayFlow kilidini aç', cancelLabel: 'Vazgeç' });
    if (r.success) setLocked(false);
  }, []);

  useEffect(() => {
    if (!enabled) setLocked(false);
  }, [enabled]);

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'background') backgroundAt.current = Date.now();
      if (s === 'active' && enabled && backgroundAt.current && Date.now() - backgroundAt.current > RELOCK_AFTER_MS) setLocked(true);
    });
    return () => sub.remove();
  }, [enabled]);

  useEffect(() => {
    if (locked) unlock().catch(() => {});
  }, [locked, unlock]);

  if (!enabled || !locked) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 18 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: palette.button, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="logo" size={36} color={palette.onButton} strokeWidth={2.2} />
      </View>
      <AppText variant="title">PayFlow kilitli</AppText>
      <AppText variant="body" muted style={{ textAlign: 'center' }}>
        Devam etmek için Face ID, parmak izi veya cihaz şifreni kullan.
      </AppText>
      <View style={{ alignSelf: 'stretch' }}>
        <PrimaryButton title="Kilidi aç" onPress={() => unlock().catch(() => {})} />
      </View>
    </View>
  );
}

export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}
