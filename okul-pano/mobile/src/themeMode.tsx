import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { storage } from './storage.ts';
import { applyPalette } from './theme.ts';
import { refreshStyles } from './ui.tsx';

/** Tema seçimi: telefonun ayarını izle, hep açık ya da hep koyu */
export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'okulpano.theme';

interface ThemeValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
  /** Tema değişince değişir; ekranlar bununla yeniden kurulur (renkler yeni değerlerle okunur) */
  key: string;
  /** Tema değişirken açık olan ekran; yeniden kurulduktan sonra oraya dönülür */
  returnTo: string | null;
  clearReturn: () => void;
}

const Ctx = createContext<ThemeValue>({ mode: 'system', isDark: false, setMode: () => {}, key: 'l', returnTo: null, clearReturn: () => {} });

let applied: boolean | null = null;

export function ThemeProvider({ children, pathname }: { children: ReactNode; pathname: string }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    void storage
      .get(KEY)
      .then((v) => setModeState(v === 'light' || v === 'dark' ? v : 'system'))
      .catch(() => setModeState('system'));
  }, []);

  const isDark = mode === 'dark' || (mode !== 'light' && system === 'dark');
  // Renkler çizimden önce değiştirilir: alttaki bileşenler ilk çizimde doğru temayı okur
  if (applied !== isDark) {
    applyPalette(isDark);
    refreshStyles();
    applied = isDark;
  }

  const setMode = useCallback(
    (m: ThemeMode) => {
      setReturnTo(pathname);
      setModeState(m);
      void storage.set(KEY, m === 'system' ? null : m);
    },
    [pathname],
  );
  const clearReturn = useCallback(() => setReturnTo(null), []);

  // Kayıtlı seçim okunana kadar (bir an) hiçbir şey çizilmez: yanlış temada parlama olmasın
  if (mode === null) return null;
  return <Ctx.Provider value={{ mode, isDark, setMode, key: isDark ? 'd' : 'l', returnTo, clearReturn }}>{children}</Ctx.Provider>;
}

export const useThemeMode = () => useContext(Ctx);
