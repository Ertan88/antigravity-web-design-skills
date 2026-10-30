import { officialHolidays } from './holidays.ts';

/**
 * Özel gün temaları: panoya o günün havasını veren hazır renkler. "Otomatik" açıksa pano
 * ilgili günlerde temayı kendisi uygular; panelden istenen tema elle de seçilebilir.
 */
export interface SpecialTheme {
  id: string;
  name: string;
  /** Panelde gösterilen tarih açıklaması */
  when: string;
  primary: string;
  accent: string;
  /** Pano üstünde ek süsleme sınıfı (bayrak şeridi vb.) */
  decor: 'flag' | 'mourning' | 'festive' | 'none';
  /** Bu tema hangi günlerde otomatik uygulanır */
  matches: (isoDate: string) => boolean;
}

const md = (iso: string) => iso.slice(5);
const religiousDays = (iso: string, prefix: string) => {
  const name = officialHolidays(Number(iso.slice(0, 4))).get(iso);
  return Boolean(name?.startsWith(prefix));
};

export const SPECIAL_THEMES: SpecialTheme[] = [
  {
    id: 'national',
    name: 'Millî Bayram',
    when: '29 Ekim, 23 Nisan, 19 Mayıs, 30 Ağustos, 15 Temmuz',
    primary: '#c8102e',
    accent: '#f5f5f5',
    decor: 'flag',
    matches: (d) => ['10-29', '04-23', '05-19', '08-30', '07-15'].includes(md(d)),
  },
  {
    id: 'ataturk',
    name: 'Atatürk’ü Anma',
    when: '10 Kasım',
    primary: '#4b5563',
    accent: '#c8102e',
    decor: 'mourning',
    matches: (d) => md(d) === '11-10',
  },
  {
    id: 'teachers',
    name: 'Öğretmenler Günü',
    when: '24 Kasım',
    primary: '#b45309',
    accent: '#be123c',
    decor: 'festive',
    matches: (d) => md(d) === '11-24',
  },
  {
    id: 'ramazan',
    name: 'Ramazan Bayramı',
    when: 'Bayram günleri ve arifesi',
    primary: '#0f766e',
    accent: '#d4a017',
    decor: 'festive',
    matches: (d) => religiousDays(d, 'Ramazan'),
  },
  {
    id: 'kurban',
    name: 'Kurban Bayramı',
    when: 'Bayram günleri ve arifesi',
    primary: '#166534',
    accent: '#d4a017',
    decor: 'festive',
    matches: (d) => religiousDays(d, 'Kurban'),
  },
  {
    id: 'newyear',
    name: 'Yeni Yıl',
    when: '25 Aralık – 1 Ocak',
    primary: '#1e3a5f',
    accent: '#e0b84c',
    decor: 'festive',
    matches: (d) => md(d) >= '12-25' || md(d) === '01-01',
  },
  {
    id: 'spring',
    name: 'Bahar / Karne',
    when: 'Elle seçilir',
    primary: '#15803d',
    accent: '#f472b6',
    decor: 'none',
    matches: () => false,
  },
];

/** O gün otomatik uygulanacak özel tema (varsa) */
export function specialThemeFor(isoDate: string): SpecialTheme | null {
  return SPECIAL_THEMES.find((t) => t.matches(isoDate)) ?? null;
}
