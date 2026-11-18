import { withAlpha } from '../theme/tokens';

/**
 * Kategori kayıt defteri. Hazır kategoriler + kullanıcının Kategori Stüdyosu'nda
 * oluşturduğu özel kategoriler aynı yapıyı kullanır.
 */
export type EntryKind = 'bill' | 'card' | 'daily' | 'income';

/** İkon anahtarları — UI katmanında SVG path'lerine eşlenir (src/ui/icons.ts). */
export type IconKey =
  | 'bolt' | 'drop' | 'flame' | 'wifi' | 'phone' | 'building' | 'rent' | 'shield' | 'tv' | 'car'
  | 'cart' | 'coffee' | 'bus' | 'fuel' | 'heart' | 'book' | 'paw' | 'plane' | 'dumbbell'
  | 'music' | 'gift' | 'smile' | 'game' | 'shirt' | 'wrench' | 'leaf' | 'card' | 'wallet' | 'home';

export interface Category {
  id: string;
  name: string;
  kind: EntryKind;
  icon: IconKey;
  /** Koyu temadaki canlı renk; açık tema için `fgLight` kullanılır. */
  color: string;
  colorLight: string;
  builtIn: boolean;
}

const c = (
  id: string, name: string, kind: EntryKind, icon: IconKey, color: string, colorLight: string,
): Category => ({ id, name, kind, icon, color, colorLight, builtIn: true });

/** Fatura türleri — fatura eklerken zorunlu seçim. */
export const BILL_TYPES: Category[] = [
  c('electricity', 'Elektrik', 'bill', 'bolt', '#FFC24D', '#8A5300'),
  c('water', 'Su', 'bill', 'drop', '#6FB6FF', '#1D5FA8'),
  c('gas', 'Doğalgaz', 'bill', 'flame', '#FF9259', '#A6421A'),
  c('internet', 'İnternet', 'bill', 'wifi', '#B49CFF', '#5B3FBF'),
  c('mobile', 'GSM', 'bill', 'phone', '#4FD8D0', '#0E6E69'),
  c('dues', 'Aidat', 'bill', 'building', '#A8B4CC', '#46536B'),
  c('rent', 'Kira', 'bill', 'rent', '#FF8FB8', '#A32A5B'),
  c('insurance', 'Sigorta', 'bill', 'shield', '#7FE08A', '#2C7A35'),
  c('subscription', 'Abonelik', 'bill', 'tv', '#FF7A7A', '#B02E2E'),
  c('tax', 'Vergi/MTV', 'bill', 'car', '#C9B48A', '#6B5726'),
];

/** Günlük harcama kategorileri. */
export const DAILY_CATEGORIES: Category[] = [
  c('grocery', 'Market', 'daily', 'cart', '#3EE6B0', '#0A7A59'),
  c('cafe', 'Kafe', 'daily', 'coffee', '#D9A47A', '#7A4A22'),
  c('transport', 'Ulaşım', 'daily', 'bus', '#5FD0FF', '#0C6A8F'),
  c('fuel', 'Akaryakıt', 'daily', 'fuel', '#FFB37A', '#94450F'),
  c('health', 'Sağlık', 'daily', 'heart', '#FF9FA8', '#A3303D'),
  c('education', 'Eğitim', 'daily', 'book', '#9FB7FF', '#3450A8'),
  c('pet', 'Evcil', 'daily', 'paw', '#F2C46D', '#7D5A10'),
];

/** Kategori Stüdyosu renk paleti (koyu, açık) çiftleri. */
export const STUDIO_COLORS: { name: string; color: string; colorLight: string }[] = [
  { name: 'Nane', color: '#3EE6B0', colorLight: '#0A7A59' },
  { name: 'Mavi', color: '#8EADFF', colorLight: '#2C57CF' },
  { name: 'Güneş', color: '#FFC24D', colorLight: '#8A5300' },
  { name: 'Pembe', color: '#FF8FB8', colorLight: '#A32A5B' },
  { name: 'Turuncu', color: '#FF9259', colorLight: '#A6421A' },
  { name: 'Mor', color: '#B49CFF', colorLight: '#5B3FBF' },
  { name: 'Turkuaz', color: '#4FD8D0', colorLight: '#0E6E69' },
  { name: 'Yeşil', color: '#7FE08A', colorLight: '#2C7A35' },
  { name: 'Mercan', color: '#FF7A7A', colorLight: '#B02E2E' },
  { name: 'Bal', color: '#F2C46D', colorLight: '#7D5A10' },
  { name: 'Gök', color: '#5FD0FF', colorLight: '#0C6A8F' },
  { name: 'Gri', color: '#A8B4CC', colorLight: '#46536B' },
];

export function createCustomCategory(input: {
  name: string;
  kind: EntryKind;
  icon: IconKey;
  colorIndex: number;
}): Category {
  const name = input.name.trim();
  if (!name) throw new Error('Kategori adı boş olamaz');
  const swatch = STUDIO_COLORS[input.colorIndex];
  if (!swatch) throw new Error('Geçersiz renk');
  const slug = name
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü]+/g, '-')
    .replace(/^-|-$/g, '');
  return {
    id: `custom-${slug}-${Date.now().toString(36)}`,
    name,
    kind: input.kind,
    icon: input.icon,
    color: swatch.color,
    colorLight: swatch.colorLight,
    builtIn: false,
  };
}

/** İkon karesi renkleri: ön plan ve yarı saydam zemin. */
export function categoryColors(cat: Category, isDark: boolean) {
  return {
    fg: isDark ? cat.color : cat.colorLight,
    bg: withAlpha(cat.color, isDark ? 0.16 : 0.24),
  };
}
