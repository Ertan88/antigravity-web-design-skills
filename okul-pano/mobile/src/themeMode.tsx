import { useNavigationContainerRef } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Appearance, DeviceEventEmitter, Easing, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { scrollMemory, scrollRestore } from './scroll.ts';
import { storage } from './storage.ts';
import { applyPalette, colors } from './theme.ts';
import { refreshStyles } from './ui.tsx';

/** Tema seçimi: telefonun (sistemin) ayarını izle, hep açık ya da hep koyu */
export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'okulpano.theme';

/**
 * Tema değişince ekranlar yeniden kurulmaz, yalnızca yeni renklerle yeniden çizilir: kaydırma konumu, açık
 * sekme ve geri yığını olduğu gibi kalır.
 *
 * Gezinme kütüphanesi açık ekranları, üstleri yeniden çizilse bile çizmez; ama her ekran sistemin renk
 * düzenini (useColorScheme) dinler. Bu yüzden seçilen tema telefonun uygulama ayarına da yazılır
 * (Appearance.setColorScheme) ve bütün ekranlar aynı anda yeni renklerle çizilir.
 *
 * Web'de bu ayar yoktur: orada ekranlar yeniden kurulur, gezinme durumu ve kaydırma konumu geri yüklenir.
 */
const NATIVE = Platform.OS !== 'web' && typeof Appearance.setColorScheme === 'function';

/** Uygulamanın renk düzenini telefona bildirir; açık ekranlar hemen yeni renklerle çizilir */
function applyAppearance(m: ThemeMode) {
  if (!NATIVE) return;
  Appearance.setColorScheme(m === 'system' ? 'unspecified' : m);
  // Elle seçilen temada ekranlar telefonun bildirimini beklemeden çizilir (aynı değer ikinci kez gelirse bir şey olmaz)
  if (m !== 'system') DeviceEventEmitter.emit('appearanceChanged', { colorScheme: m });
}
type NavState = ReturnType<ReturnType<typeof useNavigationContainerRef>['getRootState']>;

interface ThemeValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
  /** Web'de tema değişince değişir ve gezinme bununla yeniden kurulur; telefonda hep aynıdır */
  key: string;
  /** Yeniden kurulduktan sonra geri yüklenecek gezinme durumu */
  takeNavState: () => NavState | null;
}

const Ctx = createContext<ThemeValue>({ mode: 'system', isDark: false, setMode: () => {}, key: 'l', takeNavState: () => null });

let applied: boolean | null = null;
let appliedAfterLoad = false;
/** Tema değişmeden hemen önceki zemin rengi: geçiş perdesi bu renkten yeni temaya açılır */
let previousBg: string | null = null;
let savedNav: NavState | null = null;
/** "Sistem"e geçildi: telefonun gerçek teması bildirilene kadar perde açılmaz */
let awaitingSystem = false;
/** Telefonun renk düzeni bildiriminin son geliş zamanı (ekranlar o bildirimle çizilir) */
let lastAppearanceEvent = 0;
if (NATIVE) Appearance.addChangeListener(() => (lastAppearanceEvent = Date.now()));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const nav = useNavigationContainerRef();
  const [mode, setModeState] = useState<ThemeMode | null>(null);
  // Yumuşak geçiş: yeni tema, eski temanın zemin renginde bir perdenin altından yavaşça belirir
  const veil = useRef(new Animated.Value(0)).current;
  const [veilColor, setVeilColor] = useState<string | null>(null);

  useEffect(() => {
    void storage
      .get(KEY)
      .then((v) => {
        const m: ThemeMode = v === 'light' || v === 'dark' ? v : 'system';
        applyAppearance(m);
        setModeState(m);
      })
      .catch(() => setModeState('system'));
  }, []);

  const isDark = mode === 'dark' || (mode !== 'light' && system === 'dark');
  // Renkler çizimden önce değiştirilir: alttaki bileşenler ilk çizimde doğru temayı okur
  if (applied !== isDark) {
    // Kullanıcı ya da sistem temayı değiştirdiyse yerinde kalınsın (açılışta kayıtlı seçimin okunması sayılmaz)
    if (appliedAfterLoad && nav.isReady()) {
      if (!NATIVE) {
        savedNav = nav.getRootState();
        for (const path of scrollMemory.keys()) scrollRestore.add(path);
      }
      previousBg = colors.bg;
    }
    applyPalette(isDark);
    refreshStyles();
    applied = isDark;
  }
  appliedAfterLoad = mode !== null;

  const setMode = useCallback(
    (m: ThemeMode) => {
      void storage.set(KEY, m === 'system' ? null : m);
      awaitingSystem = NATIVE && m === 'system';
      applyAppearance(m);
      setModeState(m);
    },
    [],
  );

  // Tema değişti (elle ya da sistemden): perde yeni ekranlar kurulduktan sonra açılır. Çizimden önce
  // çalışır (useLayoutEffect), böylece yeni tema perdesiz bir an bile görünmez
  useLayoutEffect(() => {
    const from = previousBg;
    previousBg = null;
    if (!from) return;
    setVeilColor(from);
    // Perde önce tamamen örter: ekranlar yeni renklerle çizilirken hiçbir ara kare görünmez; sonra yeni tema
    // yavaşça açılır
    veil.setValue(1);
    const anim = Animated.timing(veil, { toValue: 0, duration: 380, easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    // "Sistem"e geçişte ekranlar telefonun bildirimiyle çizilir: bildirim henüz gelmediyse perde o gelince
    // (en geç 600 ms) açılır
    const wait = awaitingSystem && Date.now() - lastAppearanceEvent > 150 ? 600 : 160;
    awaitingSystem = false;
    let started = false;
    const reveal = () => {
      if (started) return;
      started = true;
      anim.start(() => setVeilColor(null));
    };
    const timer = setTimeout(reveal, wait);
    const sub = wait > 160 ? Appearance.addChangeListener(() => setTimeout(reveal, 60)) : null;
    return () => {
      started = true;
      clearTimeout(timer);
      sub?.remove();
      anim.stop();
    };
  }, [isDark, veil]);
  const takeNavState = useCallback(() => {
    const s = savedNav;
    savedNav = null;
    return s;
  }, []);

  // Kayıtlı seçim okunana kadar (bir an) hiçbir şey çizilmez: yanlış temada parlama olmasın
  if (mode === null) return null;
  return (
    <Ctx.Provider value={{ mode, isDark, setMode, key: NATIVE ? 'native' : isDark ? 'd' : 'l', takeNavState }}>
      <View style={{ flex: 1 }}>
        {children}
        {veilColor && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: veilColor, opacity: veil }]} />}
      </View>
    </Ctx.Provider>
  );
}

export const useThemeMode = () => useContext(Ctx);
