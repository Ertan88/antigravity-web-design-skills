import { useNavigationContainerRef } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { scrollMemory, scrollRestore } from './scroll.ts';
import { storage } from './storage.ts';
import { applyPalette } from './theme.ts';
import { refreshStyles } from './ui.tsx';

/** Tema seçimi: telefonun (sistemin) ayarını izle, hep açık ya da hep koyu */
export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'okulpano.theme';

/**
 * Tema değişince ekranlar yeni renklerle yeniden kurulur. Kullanıcı yerinden oynamasın diye o anki gezinme
 * durumu (açık sekme, geri yığını) ve ekranların kaydırma konumu saklanır, yeniden kurulunca geri yüklenir.
 */
type NavState = ReturnType<ReturnType<typeof useNavigationContainerRef>['getRootState']>;

interface ThemeValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
  /** Tema değişince değişir; gezinme bununla yeniden kurulur */
  key: string;
  /** Yeniden kurulduktan sonra geri yüklenecek gezinme durumu */
  takeNavState: () => NavState | null;
}

const Ctx = createContext<ThemeValue>({ mode: 'system', isDark: false, setMode: () => {}, key: 'l', takeNavState: () => null });

let applied: boolean | null = null;
let appliedAfterLoad = false;
let savedNav: NavState | null = null;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const nav = useNavigationContainerRef();
  const [mode, setModeState] = useState<ThemeMode | null>(null);

  useEffect(() => {
    void storage
      .get(KEY)
      .then((v) => setModeState(v === 'light' || v === 'dark' ? v : 'system'))
      .catch(() => setModeState('system'));
  }, []);

  const isDark = mode === 'dark' || (mode !== 'light' && system === 'dark');
  // Renkler çizimden önce değiştirilir: alttaki bileşenler ilk çizimde doğru temayı okur
  if (applied !== isDark) {
    // Kullanıcı ya da sistem temayı değiştirdiyse yerinde kalınsın (açılışta kayıtlı seçimin okunması sayılmaz)
    if (appliedAfterLoad && nav.isReady()) {
      savedNav = nav.getRootState();
      for (const path of scrollMemory.keys()) scrollRestore.add(path);
    }
    applyPalette(isDark);
    refreshStyles();
    applied = isDark;
  }
  appliedAfterLoad = mode !== null;

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    void storage.set(KEY, m === 'system' ? null : m);
  }, []);
  const takeNavState = useCallback(() => {
    const s = savedNav;
    savedNav = null;
    return s;
  }, []);

  // Kayıtlı seçim okunana kadar (bir an) hiçbir şey çizilmez: yanlış temada parlama olmasın
  if (mode === null) return null;
  return <Ctx.Provider value={{ mode, isDark, setMode, key: isDark ? 'd' : 'l', takeNavState }}>{children}</Ctx.Provider>;
}

export const useThemeMode = () => useContext(Ctx);
