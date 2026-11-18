/**
 * PayFlow tasarım jetonları — canvas tasarımıyla birebir aynı değerler.
 * Koyu tema "Gece Mavisi", açık tema okunabilirlik için koyulaştırılmış vurgularla.
 */
export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  text: string;
  muted: string;
  accent: string; // nane — metin/ikon için
  button: string;
  onButton: string;
  warn: string; // kehribar — yaklaşan
  warnBg: string;
  danger: string; // mercan — faiz/gecikme
  dangerBg: string;
  info: string; // mavi — kartlar
  infoBg: string;
  glow: string;
}

export const dark: Palette = {
  bg: '#0B1220',
  surface: '#131C2E',
  surface2: '#1B2740',
  line: '#283652',
  text: '#EAF0FA',
  muted: '#9AA6BF',
  accent: '#3EE6B0',
  button: '#3EE6B0',
  onButton: '#04261B',
  warn: '#FFB547',
  warnBg: 'rgba(255,181,71,0.18)',
  danger: '#FF8080',
  dangerBg: 'rgba(255,128,128,0.14)',
  info: '#8EADFF',
  infoBg: 'rgba(142,173,255,0.14)',
  glow: 'rgba(62,230,176,0.22)',
};

export const light: Palette = {
  bg: '#F3F5FA',
  surface: '#FFFFFF',
  surface2: '#E9EEF5',
  line: '#D8DFEA',
  text: '#0B1220',
  muted: '#55617A',
  accent: '#0A7A59',
  button: '#087A58',
  onButton: '#FFFFFF',
  warn: '#995300',
  warnBg: 'rgba(255,170,40,0.22)',
  danger: '#C03434',
  dangerBg: 'rgba(220,60,60,0.10)',
  info: '#2C57CF',
  infoBg: 'rgba(44,87,207,0.10)',
  glow: 'rgba(8,122,88,0.18)',
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

/** Bir hex rengi verilen saydamlıkla rgba'ya çevirir (kategori ikon zeminleri için). */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}
