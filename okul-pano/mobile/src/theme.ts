/**
 * Uygulamanın tasarım sistemi ("bento"): sıcak kâğıt zemin, koyu mürekkep ana renk ve bilgiyi
 * türüne göre ayıran pastel kutular. Uyarı için turuncu, acil durum için kırmızı.
 *
 * Açık ve koyu tema: `colors` ve `tiles` aynı nesneler olarak kalır, tema değişince içleri değiştirilir
 * (applyPalette) ve uygulama yeniden çizilir (bkz. themeMode.tsx). Böylece ekranlar `colors.ink` gibi
 * yazmaya devam eder.
 */
const LIGHT = {
  bg: '#f7f6f3',
  card: '#ffffff',
  border: '#ebe8e2',
  borderStrong: '#dcd7cf',
  divider: '#f1efea',
  ink: '#1c1917',
  muted: '#57534e',
  faint: '#78716c',
  subtle: '#a8a29e',
  primary: '#1c1917',
  /** Ana renkli zeminin (birincil düğme, seçili çip) üstündeki yazı */
  onPrimary: '#ffffff',
  primarySoft: '#f0ede8',
  primaryDark: '#0c0a09',
  brand: '#0E5E66',
  info: '#0369a1',
  infoSoft: '#e0f2fe',
  warning: '#c2410c',
  warningSoft: '#ffedd5',
  warningBorder: '#fed7aa',
  warningTint: '#fffaf5',
  danger: '#e11d48',
  dangerSoft: '#ffe4e6',
  dangerBorder: '#fecdd3',
  dangerTint: '#fff5f6',
  success: '#15803d',
  successSoft: '#dcfce7',
  gold: '#a16207',
  goldSoft: '#fef3c7',
};

export type Palette = Record<keyof typeof LIGHT, string>;

const DARK: Palette = {
  bg: '#0f0e0d',
  card: '#1d1b18',
  border: '#2f2b27',
  borderStrong: '#403b35',
  divider: '#28251f',
  ink: '#f5f3ef',
  muted: '#cdc8c1',
  faint: '#a8a29e',
  subtle: '#78716c',
  primary: '#ece9e4',
  onPrimary: '#1c1917',
  primarySoft: '#2a2723',
  primaryDark: '#ffffff',
  brand: '#5fb3bb',
  info: '#7dd3fc',
  infoSoft: '#0d2b3e',
  warning: '#fb923c',
  warningSoft: '#3a2414',
  warningBorder: '#5a3418',
  warningTint: '#241a12',
  danger: '#fb7185',
  dangerSoft: '#3e1422',
  dangerBorder: '#5c1d31',
  dangerTint: '#1f1214',
  success: '#4ade80',
  successSoft: '#10301e',
  gold: '#fbbf24',
  goldSoft: '#3a300c',
};

export const colors: Palette = { ...LIGHT };

type Tile = { bg: string; fg: string; sub: string; chip: string };
const TILE_KEYS = ['ink', 'sun', 'peach', 'mint', 'sky', 'lilac', 'rose', 'paper'] as const;
export type TileTone = (typeof TILE_KEYS)[number];

/** Bento kutularının renkleri: zemin, yazı ve (varsa) simge kutusu */
export const LIGHT_TILES: Record<TileTone, Tile> = {
  ink: { bg: '#1c1917', fg: '#ffffff', sub: 'rgba(255,255,255,0.62)', chip: 'rgba(255,255,255,0.12)' },
  sun: { bg: '#fde68a', fg: '#713f12', sub: 'rgba(113,63,18,0.78)', chip: '#fbbf24' },
  peach: { bg: '#fed7aa', fg: '#7c2d12', sub: 'rgba(124,45,18,0.78)', chip: 'rgba(255,255,255,0.55)' },
  mint: { bg: '#bbf7d0', fg: '#14532d', sub: 'rgba(20,83,45,0.78)', chip: 'rgba(255,255,255,0.55)' },
  sky: { bg: '#bae6fd', fg: '#0c4a6e', sub: 'rgba(12,74,110,0.78)', chip: 'rgba(255,255,255,0.55)' },
  lilac: { bg: '#ddd6fe', fg: '#3b0764', sub: 'rgba(59,7,100,0.75)', chip: 'rgba(255,255,255,0.55)' },
  rose: { bg: '#fecdd3', fg: '#881337', sub: 'rgba(136,19,55,0.78)', chip: 'rgba(255,255,255,0.55)' },
  paper: { bg: '#ffffff', fg: '#1c1917', sub: '#78716c', chip: '#f0ede8' },
};

/** Koyu temada kutular koyu zeminli, açık yazılı (pastel ton yazıda kalır) */
const DARK_TILES: Record<TileTone, Tile> = {
  ink: { bg: '#2e2a26', fg: '#ffffff', sub: 'rgba(255,255,255,0.62)', chip: 'rgba(255,255,255,0.12)' },
  sun: { bg: '#3a300c', fg: '#fde68a', sub: 'rgba(253,230,138,0.74)', chip: '#a16207' },
  peach: { bg: '#3d2412', fg: '#fed7aa', sub: 'rgba(254,215,170,0.74)', chip: 'rgba(255,255,255,0.1)' },
  mint: { bg: '#10301e', fg: '#bbf7d0', sub: 'rgba(187,247,208,0.74)', chip: 'rgba(255,255,255,0.1)' },
  sky: { bg: '#0d2b3e', fg: '#bae6fd', sub: 'rgba(186,230,253,0.74)', chip: 'rgba(255,255,255,0.1)' },
  lilac: { bg: '#26193f', fg: '#ddd6fe', sub: 'rgba(221,214,254,0.74)', chip: 'rgba(255,255,255,0.1)' },
  rose: { bg: '#3e1422', fg: '#fecdd3', sub: 'rgba(254,205,211,0.74)', chip: 'rgba(255,255,255,0.1)' },
  paper: { bg: '#1d1b18', fg: '#f5f3ef', sub: '#a8a29e', chip: '#2a2723' },
};

export const tiles: Record<TileTone, Tile> = Object.fromEntries(TILE_KEYS.map((k) => [k, { ...LIGHT_TILES[k] }])) as Record<TileTone, Tile>;

/** Şu anki tema (durum çubuğu ve sistem öğeleri için) */
export let dark = false;

/** Renkleri seçilen temaya çevirir (nesneler aynı kalır, içerikleri değişir) */
export function applyPalette(isDark: boolean) {
  dark = isDark;
  Object.assign(colors, isDark ? DARK : LIGHT);
  for (const k of TILE_KEYS) Object.assign(tiles[k], isDark ? DARK_TILES[k] : LIGHT_TILES[k]);
}

export const radius = { sm: 12, md: 16, lg: 22, xl: 26, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 } as const;
