import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';

/** İki geri basışı arasındaki en uzun süre */
const WINDOW_MS = 2000;

/**
 * Alt menülü ekranlarda geri tuşu (Android): başka bir sekmedeyken önce ana ekrana (ilk sekme) döner; ana ekranda
 * ilk basışta "Çıkmak için tekrar geri basın" yazısı çıkar, 2 saniye içinde ikinci basışta uygulama kapanır.
 * Sekme geçmişinde geri gidilmez (son adımda uygulama kapanıyordu). Üstte açılmış ekran ya da pencere varsa onlar
 * kendi geri davranışını uygular (bu kanca yalnızca sekmeler odaktayken çalışır).
 */
export function useTabsBackGuard(onHome: boolean, goHome: () => void) {
  const last = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!onHome) {
          goHome();
          return true;
        }
        const now = Date.now();
        if (now - last.current < WINDOW_MS) return false;
        last.current = now;
        ToastAndroid.show('Çıkmak için tekrar geri basın', ToastAndroid.SHORT);
        return true;
      });
      return () => sub.remove();
    }, [onHome, goHome]),
  );
}
