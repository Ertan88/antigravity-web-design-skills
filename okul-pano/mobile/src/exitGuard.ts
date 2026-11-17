import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';

/** İki geri basışı arasındaki en uzun süre */
const WINDOW_MS = 2000;

/**
 * Ana ekrandan yanlışlıkla çıkışı önler (A): Android'de ilk geri basışta "Çıkmak için tekrar geri basın" yazısı
 * çıkar, 2 saniye içinde ikinci basışta uygulama kapanır. Geri gidilecek bir ekran varsa normal geri davranışı sürer.
 */
export function useExitGuard() {
  const last = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (router.canGoBack()) return false;
        const now = Date.now();
        if (now - last.current < WINDOW_MS) return false;
        last.current = now;
        ToastAndroid.show('Çıkmak için tekrar geri basın', ToastAndroid.SHORT);
        return true;
      });
      return () => sub.remove();
    }, []),
  );
}
