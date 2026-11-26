import type { TileTone } from './theme.ts';
import type { IconName } from './ui.tsx';

export type SettingsCategory = 'okul' | 'gorev' | 'moduller' | 'takvim' | 'ogrenci' | 'mesleki' | 'pano' | 'destek';

/** Genel ayarlar kategorileri: webdeki Genel Ayarlar sekmeleriyle aynı ad ve sırada */
export const SETTINGS_CATEGORIES: { key: SettingsCategory; title: string; hint: string; icon: IconName; tone: TileTone; keywords: string }[] = [
  { key: 'okul', title: 'Okul', hint: 'Ad, kurum kodu, panodaki yer adı', icon: 'school-outline', tone: 'sky', keywords: 'okul adı kurum kodu yer konum logo kvkk' },
  { key: 'gorev', title: 'Görev dağılımı', hint: 'Bildirim, sorun sorumluları', icon: 'people-outline', tone: 'peach', keywords: 'görev dağılımı bildirim onay sorun sorumlu rol' },
  { key: 'moduller', title: 'Modüller', hint: 'Duyuru onayı, staj, taşımalı', icon: 'grid-outline', tone: 'mint', keywords: 'modül duyuru onayı mesleki eğitim staj taşımalı servis' },
  { key: 'takvim', title: 'Takvim ve zil', hint: 'MEB takvimi, arife, öğle arası', icon: 'calendar-week', tone: 'sun', keywords: 'takvim meb tatil arife yarım gün öğle arası zil' },
  { key: 'ogrenci', title: 'Öğrenci takibi', hint: 'Saklama süresi, uyarı', icon: 'clipboard-outline', tone: 'lilac', keywords: 'öğrenci gözlem saklama kvkk rehberlik uyarı' },
  { key: 'mesleki', title: 'Mesleki eğitim', hint: 'Koordinatör, staj', icon: 'business-outline', tone: 'rose', keywords: 'mesleki eğitim staj koordinatör müdür yardımcısı program atp' },
  { key: 'pano', title: 'Pano ve yayın', hint: 'Özel günler, kayan yazı', icon: 'tv-outline', tone: 'sky', keywords: 'pano özel gün kayan yazı günün sözü hava uyarısı rss' },
  { key: 'destek', title: 'Destek', hint: 'Süreli erişim', icon: 'key-outline', tone: 'peach', keywords: 'destek erişim platform' },
];
