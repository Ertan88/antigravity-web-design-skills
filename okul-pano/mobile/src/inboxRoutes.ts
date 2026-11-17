import type { InboxItem } from './data.ts';

/** Paneldeki adresleri uygulamadaki ekranlara çevirir */
export const ROUTES: Record<string, string> = {
  approval: '/onaylar',
  'leave-request': '/onaylar',
  returned: '/duyurular',
  approved: '/duyurular',
  'duty-gap': '/nobet',
  'month-student': '/duyuru-yeni',
  'support-access': '/okullar',
  'support-revoked': '/okullar',
  'support-expired': '/okullar',
  'meb-calendar': '/takvim',
  internship: '/isletme-devam',
  enroll: '/kullanicilar?filtre=onay',
  exam: '/sinav-takvimi',
  bell: '/programim',
  conduct: '/rehberlik',
  'duty-assign': '/nobet',
  emergency: '/acil',
  'screen-security': '/panolar',
  // Görev dersi ana ekranda ve ders programında "GÖREV" etiketiyle görünür
  'lesson-cover': '/',
  'leave-reviewed': '/izin',
  'leave-withdrawn': '/onaylar',
  'cover-needed': '/gorevlendirme',
};

/**
 * Bildirimin uygulamadaki ekranı (bildirim kutusu ve üstten çıkan kart aynı kuralı kullanır). Bildirimin `to` alanı
 * web panelin adresidir; uygulamada doğrudan açılmaz. Eşleşmeyen bildirim bildirim kutusunda açılır.
 */
export function inboxRoute(n: Pick<InboxItem, 'kind' | 'to'>): string | undefined {
  // Sorun ve destek bildirimleri doğrudan ilgili yazışmayı açar
  const id = /[?&]id=([\w-]+)/.exec(n.to ?? '')?.[1];
  if (n.kind === 'issue') return id ? `/sorun/${id}` : '/sorunlar';
  if (n.kind === 'support-reply') return id ? `/talep/${id}` : '/platforma-yaz';
  if (n.kind === 'support-ticket') return id ? `/talep/${id}?p=1` : '/platform/destek';
  const day = n.kind === 'exam' ? /[?&]gun=(\d{4}-\d{2}-\d{2})/.exec(n.to ?? '')?.[1] : null;
  if (day) return `/sinav-takvimi?gun=${day}`;
  // İşletmede devamsızlık: bildirilen ayın çizelgesi açılır
  const month = n.kind === 'internship' ? /[?&]gun=(\d{4}-\d{2})-\d{2}/.exec(n.to ?? '')?.[1] : null;
  return month ? `/isletme-devam?ay=${month}` : ROUTES[n.kind];
}
