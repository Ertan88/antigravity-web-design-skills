import Svg, { Path } from 'react-native-svg';
import type { IconKey } from '../core/categories';

/**
 * PayFlow ikon seti — 24×24 ızgarada, yuvarlak uçlu çizgi ikonlar.
 * Tasarım canvas'ındaki path'lerle birebir aynıdır.
 */
export type UiIconKey =
  | 'calendar' | 'plus' | 'chart' | 'bell' | 'user' | 'chevronRight' | 'back' | 'close' | 'scan'
  | 'alert' | 'search' | 'clock' | 'users' | 'doc' | 'eye' | 'faceId' | 'check' | 'bulb' | 'logo';

export type AnyIconKey = IconKey | UiIconKey;

export const ICON_PATHS: Record<AnyIconKey, string> = {
  // kategori ikonları
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  drop: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  flame: 'M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 3 2 0-2 0-4 0-6z',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  phone: 'M7 2h10v20H7zM11 18h2',
  building: 'M4 21V4h10v17M14 9h6v12M2 21h20M7 8h1M10 8h1M7 12h1M10 12h1M7 16h1M10 16h1',
  rent: 'M3 12l9-8 9 8M5 10v10h14V10M10 20v-5h4v5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  tv: 'M3 6h18v12H3zM8 21h8M8 2l4 4 4-4',
  car: 'M5 16l1.5-5h11l1.5 5M4 16h16v3H4zM7 19v2M17 19v2',
  cart: 'M3 4h2l2.5 11h11L21 7H6.5M9 20h.01M18 20h.01',
  coffee: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3',
  bus: 'M5 4h14v13H5zM5 11h14M8 20v-3M16 20v-3M8 14h.01M16 14h.01',
  fuel: 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8l3 3v6a2 2 0 0 0 4 0V9l-3-3',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M9 7h6',
  paw: 'M5 10a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M8.5 6a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M12.5 6a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M16 10a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M12 12c-3 0-5 3.5-5 5.5 0 1.5 1.2 2.5 2.6 2.5 1 0 1.6-.5 2.4-.5s1.4.5 2.4.5c1.4 0 2.6-1 2.6-2.5 0-2-2-5.5-5-5.5z',
  plane: 'M3 12l18-8-7 18-3-7z',
  dumbbell: 'M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  gift: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0',
  smile: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 14c2 2 5 2 7 0M9 9.5h.01M15 9.5h.01',
  game: 'M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.5H9A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M16 12h.01M18 14h.01',
  shirt: 'M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3c0 2-2 3-4 3S8 5 8 3z',
  wrench: 'M15 4a5 5 0 0 0-4.6 7L3 18.4 5.6 21l7.4-7.4A5 5 0 0 0 20 9l-3 3-3-3 3-3a5 5 0 0 0-2-2z',
  leaf: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M16 13.5h.01',
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  // arayüz ikonları
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  plus: 'M12 5v14M5 12h14',
  chart: 'M5 20V11M12 20V5M19 20v-6M3 20h18',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  chevronRight: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10',
  alert: 'M12 3l10 18H2zM12 10v4M12 17.5h.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M16 4a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 4 6',
  doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  faceId: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M9 9v1M15 9v1M12 9v4h-1M9 16c2 1.3 4 1.3 6 0',
  check: 'M5 12l5 5 9-10',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  logo: 'M3 9c3-5 6-5 9 0s6 5 9 0M3 16c3-5 6-5 9 0s6 5 9 0',
};

export function Icon({
  name,
  size = 22,
  color,
  strokeWidth = 1.8,
}: {
  name: AnyIconKey;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={ICON_PATHS[name]} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
