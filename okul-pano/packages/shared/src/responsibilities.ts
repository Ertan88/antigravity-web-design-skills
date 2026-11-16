/** Görev dağılımındaki işler (Okul Ayarları › Görev dağılımı) */
export const RESPONSIBILITY_AREAS = [
  { key: 'leaves', label: 'İzin bildirimleri', text: 'Öğretmenlerin izin talepleri onaya gelir' },
  { key: 'duties', label: 'Nöbet çizelgesi', text: 'Boş kalan nöbet yeri ve köprü günleri' },
  { key: 'issues', label: 'Okul sorunları', text: 'Yeni sorun bildirimleri (kategori sorumluları ayrıca alır)' },
  { key: 'announcements', label: 'Duyuru onayı', text: 'Onay bekleyen duyurular' },
] as const;
export type ResponsibilityArea = (typeof RESPONSIBILITY_AREAS)[number]['key'];

/**
 * Bir işin bildirimini alacaklar: görev dağılımında seçilenler (yetkisi olanlarla kesişim), seçilmemişse yetkisi olan
 * bütün kişiler. Seçilen kişiler artık yetkili değilse (ör. rolü değişti) yine yetkililerin tamamına düşer.
 */
export function responsibleFor(chosen: readonly string[] | undefined, eligible: readonly string[]): string[] {
  const pick = (chosen ?? []).filter((id) => eligible.includes(id));
  return pick.length ? pick : [...eligible];
}
