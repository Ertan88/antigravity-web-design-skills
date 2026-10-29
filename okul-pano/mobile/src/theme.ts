/**
 * Uygulamanın tasarım sistemi ("bento"): sıcak kâğıt zemin, koyu mürekkep ana renk ve bilgiyi
 * türüne göre ayıran pastel kutular. Uyarı için turuncu, acil durum için kırmızı.
 */
export const colors = {
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
  primarySoft: '#f0ede8',
  primaryDark: '#0c0a09',
  brand: '#0E5E66',
  warning: '#c2410c',
  warningSoft: '#ffedd5',
  warningBorder: '#fed7aa',
  danger: '#e11d48',
  dangerSoft: '#ffe4e6',
  success: '#15803d',
  successSoft: '#dcfce7',
  gold: '#a16207',
  goldSoft: '#fef3c7',
} as const;

/** Bento kutularının renkleri: zemin, yazı ve (varsa) simge kutusu */
export const tiles = {
  ink: { bg: '#1c1917', fg: '#ffffff', sub: 'rgba(255,255,255,0.62)', chip: 'rgba(255,255,255,0.12)' },
  sun: { bg: '#fde68a', fg: '#713f12', sub: 'rgba(113,63,18,0.78)', chip: '#fbbf24' },
  peach: { bg: '#fed7aa', fg: '#7c2d12', sub: 'rgba(124,45,18,0.78)', chip: 'rgba(255,255,255,0.55)' },
  mint: { bg: '#bbf7d0', fg: '#14532d', sub: 'rgba(20,83,45,0.78)', chip: 'rgba(255,255,255,0.55)' },
  sky: { bg: '#bae6fd', fg: '#0c4a6e', sub: 'rgba(12,74,110,0.78)', chip: 'rgba(255,255,255,0.55)' },
  lilac: { bg: '#ddd6fe', fg: '#3b0764', sub: 'rgba(59,7,100,0.75)', chip: 'rgba(255,255,255,0.55)' },
  rose: { bg: '#fecdd3', fg: '#881337', sub: 'rgba(136,19,55,0.78)', chip: 'rgba(255,255,255,0.55)' },
  paper: { bg: '#ffffff', fg: '#1c1917', sub: '#78716c', chip: '#f0ede8' },
} as const;
export type TileTone = keyof typeof tiles;

export const radius = { sm: 12, md: 16, lg: 22, xl: 26, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 } as const;
