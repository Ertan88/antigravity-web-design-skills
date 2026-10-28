/**
 * Okulun kendi adlandırabildiği başlıklar (ör. "Taşıma ve Öğle Yemeği Nöbetçileri" yerine "Servis Nöbetçileri").
 * Boş bırakılan başlık varsayılanı kullanır. Değiştirme yetkisi: okul sahibi / yönetici ve "Başlıkları düzenleme"
 * yetkisi verilen kullanıcılar; platform yöneticisi her okulda.
 */
export const LABELS = {
  dutyCard: { default: 'Nöbetçi Öğretmenler', where: 'Pano: nöbet kartının başlığı' },
  dutyPlaces: { default: 'Nöbet Yerleri ve Öğretmenler', where: 'Panel: Nöbet Çizelgesi sekmesi' },
  supervisor: { default: 'Nöbetçi Müdür Yardımcısı', where: 'Panel: Nöbet Çizelgesi sekmesi · Pano: nöbet kartı' },
  transport: { default: 'Taşıma ve Öğle Yemeği Nöbetçileri', where: 'Panel: Nöbet Çizelgesi sekmesi · Pano: nöbet kartı' },
  exams: { default: 'Sınav Sayacı', where: 'Pano: sınav kartı' },
  leaves: { default: 'İzinli Öğretmenler', where: 'Pano: izinliler kartı' },
  birthdays: { default: 'İyi ki doğdun!', where: 'Pano: doğum günü kartı' },
  bell: { default: 'Zil Vakti', where: 'Pano: zil kartı' },
  events: { default: 'Etkinlik Takvimi', where: 'Pano: etkinlik kartı' },
  book: { default: 'Haftanın Kitabı', where: 'Pano: kitap kartı' },
} as const;

export type LabelKey = keyof typeof LABELS;
export const LABEL_KEYS = Object.keys(LABELS) as LabelKey[];
export type Labels = Partial<Record<LabelKey, string>>;

/** Okulun verdiği başlık, yoksa varsayılan. `fallback` varsayılan yerine kullanılacak kısa ad (ör. panoda "Nöbetçi Müdür Yrd.") */
export function labelOf(labels: Labels | undefined | null, key: LabelKey, fallback?: string): string {
  return labels?.[key]?.trim() || fallback || LABELS[key].default;
}
