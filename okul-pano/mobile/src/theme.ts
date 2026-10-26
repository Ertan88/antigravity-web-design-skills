/** Uygulamanın küçük tasarım sistemi: sakin zemin, tek ana renk, uyarı için turuncu, acil durum için kırmızı */
export const colors = {
  bg: '#f3f6f8',
  card: '#ffffff',
  border: '#e2e8ee',
  borderStrong: '#cfd8de',
  ink: '#0f172a',
  muted: '#475569',
  faint: '#64748b',
  primary: '#0e6a85',
  primarySoft: '#e8f4f7',
  primaryDark: '#0a4f63',
  warning: '#c2410c',
  warningSoft: '#fff1e6',
  warningBorder: '#f3d3b4',
  danger: '#b91c1c',
  dangerSoft: '#fde2e2',
  success: '#15803d',
  successSoft: '#e7f6ec',
  gold: '#a16207',
  goldSoft: '#fdf3d8',
} as const;

export const radius = { sm: 10, md: 14, lg: 18, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 } as const;
