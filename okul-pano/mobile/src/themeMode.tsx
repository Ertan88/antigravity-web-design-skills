import { useNavigationContainerRef } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Animated, Appearance, DeviceEventEmitter, Easing, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { scrollMemory, scrollRestore } from './scroll.ts';
// Uzantısız: web'de snapshot.web.ts seçilir
import { snapshot } from './snapshot';
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
 * Geçiş: tema seçilince ekranın o anki görüntüsü alınır, üstte tutulur; altında yeni tema çizilince bu görüntü
 * yavaşça erir (yumuşak geçiş). Telefon temayı kendisi değiştirirse (Sistem) görüntü alınamaz; kısa bir solma olur.
 *
 * Web'de bu ayar yoktur: orada ekranlar yeniden kurulur, gezinme durumu ve kaydırma konumu geri yüklenir.
 */
const NATIVE = Platform.OS !== 'web' && typeof Appearance.setColorScheme === 'function';

/** Eski görünümün yeni görünüm üstünde erime süresi */
const FADE_MS = 300;
/** Yeni temanın çizilmesi en fazla bu kadar beklenir (ör. "Sistem" seçildi ama telefonun teması zaten aynı) */
const PAINT_WAIT_MS = 700;

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
/** Tema değişmeden hemen önceki zemin rengi: (görüntü alınamadıysa) geçiş perdesi bu renkten açılır */
let previousBg: string | null = null;
let savedNav: NavState | null = null;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const nav = useNavigationContainerRef();
  const [mode, setModeState] = useState<ThemeMode | null>(null);
  const root = useRef<ComponentRef<typeof View>>(null);
  // Perde: görüntü alınamayan geçişlerde eski zemin renginde kısa bir solma
  const veil = useRef(new Animated.Value(0)).current;
  const [veilColor, setVeilColor] = useState<string | null>(null);
  // Yumuşak geçiş: eski görünümün görüntüsü, yeni görünümün üstünde erir
  const shotOpacity = useRef(new Animated.Value(0)).current;
  const [shot, setShot] = useState<string | null>(null);
  /** Görüntü ekrana gelince uygulanacak tema */
  const pendingMode = useRef<ThemeMode | null>(null);
  /** Yeni tema çizildi mi bekleniyor (görüntü o zaman erir) */
  const awaitingPaint = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

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

  // Telefonda etkin tema, ekranların da okuduğu renk düzenidir (seçim ona yazılır); böylece ekranlar ve renkler
  // hep aynı çizimde değişir
  const isDark = NATIVE && mode !== null ? system === 'dark' : mode === 'dark' || (mode !== 'light' && system === 'dark');
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

  const commit = useCallback((m: ThemeMode) => {
    void storage.set(KEY, m === 'system' ? null : m);
    applyAppearance(m);
    setModeState(m);
  }, []);

  const fadeShot = useCallback(() => {
    if (!awaitingPaint.current) return;
    awaitingPaint.current = false;
    if (fallback.current) clearTimeout(fallback.current);
    Animated.timing(shotOpacity, { toValue: 0, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
      setShot(null);
      busy.current = false;
    });
  }, [shotOpacity]);

  // Görüntü ekranı örttü: tema şimdi değişir. Yeni tema çizilince görüntü erir; "Sistem" seçildiyse ve
  // telefonun teması zaten aynıysa (çizim olmaz) en geç PAINT_WAIT_MS sonra erir. Tema bir kare sonra değişir:
  // görüntü önce ekrana gelsin
  const onShotShown = useCallback(() => {
    const m = pendingMode.current;
    if (!m) return;
    pendingMode.current = null;
    requestAnimationFrame(() => {
      awaitingPaint.current = true;
      fallback.current = setTimeout(fadeShot, PAINT_WAIT_MS);
      commit(m);
    });
  }, [commit, fadeShot]);

  const setMode = useCallback(
    (m: ThemeMode) => {
      // Etkin tema değişmeyecekse (ör. açıkken "Açık"), geçiş sürüyorsa ya da web'deyse görüntü alınmaz
      const nowDark = applied === true;
      const same = (m === 'dark' && nowDark) || (m === 'light' && !nowDark);
      if (busy.current) {
        // Görüntü henüz ekrana gelmediyse son seçim uygulanır; geldiyse yeni seçim hemen uygulanır
        if (pendingMode.current) pendingMode.current = m;
        else commit(m);
        return;
      }
      if (!NATIVE || same) return commit(m);
      busy.current = true;
      void snapshot(root).then((uri) => {
        if (!uri) {
          busy.current = false;
          return commit(m);
        }
        pendingMode.current = m;
        shotOpacity.setValue(1);
        setShot(uri);
        // Görüntü bir sebeple yüklenemezse de tema değişir
        setTimeout(() => pendingMode.current && onShotShown(), 800);
      });
    },
    [commit, onShotShown, shotOpacity],
  );

  // Tema değişti (elle ya da sistemden). Çizimden önce çalışır (useLayoutEffect)
  useLayoutEffect(() => {
    const from = previousBg;
    previousBg = null;
    if (!from) return;
    // Görüntü üstteyse: yeni ekranlar bir sonraki karede görünür, görüntü o zaman erimeye başlar
    if (awaitingPaint.current) {
      const id = requestAnimationFrame(() => requestAnimationFrame(fadeShot));
      return () => cancelAnimationFrame(id);
    }
    setVeilColor(from);
    // Web: ekranlar yeniden kurulurken perde tamamen örter, sonra açılır. Telefon (sistem değiştirdi): ekranlar
    // yerinde değiştiği için perde yarı saydam başlar ve kısa sürede solar
    veil.setValue(NATIVE ? 0.5 : 1);
    const anim = Animated.sequence([
      Animated.delay(NATIVE ? 0 : 160),
      Animated.timing(veil, { toValue: 0, duration: NATIVE ? 260 : 380, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    ]);
    anim.start(() => setVeilColor(null));
    return () => anim.stop();
  }, [isDark, veil, fadeShot]);

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
        {/* Görüntüsü alınan kısım: bütün ekranlar ve alt menü (perde ve görüntünün kendisi dışarıda) */}
        <View ref={root} collapsable={false} style={{ flex: 1 }}>
          {children}
        </View>
        {veilColor && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: veilColor, opacity: veil }]} />}
        {shot && (
          <Animated.Image
            source={{ uri: shot }}
            onLoad={onShotShown}
            onError={() => {
              // Görüntü açılamadı: tema yine de değişir, geçiş efektsiz olur
              const m = pendingMode.current;
              pendingMode.current = null;
              setShot(null);
              busy.current = false;
              if (m) commit(m);
            }}
            fadeDuration={0}
            pointerEvents="none"
            resizeMode="stretch"
            style={[StyleSheet.absoluteFill, { opacity: shotOpacity }]}
          />
        )}
      </View>
    </Ctx.Provider>
  );
}

export const useThemeMode = () => useContext(Ctx);
