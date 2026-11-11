/**
 * Okul içindeki yetkiler. Sahip (owner) ve yönetici (admin) rolleri tüm yetkilere
 * sahiptir; editör rolündeki kullanıcılar yalnızca kendilerine verilen yetkileri kullanır.
 * Okuma her üye için serbesttir, yazma işlemleri ilgili yetkiyi gerektirir.
 */
export const PERMISSIONS = {
  'announcements.manage': 'Duyurular',
  'announcements.approve': 'Duyuruları onaylama',
  'emergency.manage': 'Acil durum uyarısı',
  'board.control': 'Panoları uzaktan yönetme',
  'highlights.manage': 'Başarılar, etkinlikler, haftanın kitabı',
  'ticker.manage': 'Kayan yazı',
  'exams.manage': 'Sınav sayacı ve sınav takvimi',
  'duties.manage': 'Nöbet çizelgesi',
  'leaves.manage': 'İzinli öğretmenler',
  'students.manage': 'Öğrenciler ve doğum günleri',
  'directory.manage': 'Öğretmenler ve sınıflar',
  'schedule.manage': 'Zil saatleri ve ders programı',
  'screens.manage': 'Ekranlar',
  'settings.manage': 'Okul ayarları',
  'labels.manage': 'Başlıkları düzenleme',
  'users.manage': 'Kullanıcılar ve yetkiler',
  /** Dar yetki: yalnızca "Öğretmen" rolüyle hesap açar (giriş kodu, toplantı QR'ı, onay, davet); yetki veremez, şifre sıfırlayamaz */
  'accounts.enroll': 'Öğretmen hesabı açma',
  'conduct.manage': 'Gözlem kriterleri ve ayın öğrencisi',
  /**
   * Mesleki eğitimi yönetir: bütün işletmeleri ve öğrencileri görür, koordinatör öğretmenleri işaretler, koordinatör
   * müdür yardımcısını seçer. Müdür yardımcılarına da açıkça verilir (rolle kendiliğinden gelmez; bkz. ADMIN_GRANTABLE).
   */
  'internship.manage': 'Mesleki eğitimi yönetir',
  /** Rehber öğretmen: bütün öğrencilerin gözlem kayıtlarını görür (panelde "Rehber öğretmen" rolü olarak verilir) */
  'conduct.counsel': 'Rehber öğretmen (bütün gözlem kayıtları)',
  /** Okul Yayın ekibine (platforma) destek talebi yazma; müdür ve müdür yardımcılarında hep vardır */
  'support.contact': 'Platforma yazma',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export const ROLES = {
  owner: 'Okul müdürü',
  admin: 'Yönetici',
  editor: 'Editör',
} as const;

export type Role = keyof typeof ROLES;

/**
 * Müdür yardımcılarına (admin) da tek tek verilen yetkiler: rol bütün yetkileri verse de bu yetkinin asıl anlamı
 * (ör. bütün işletmelerdeki öğrencileri görmek) yalnızca açıkça verilmişse geçerlidir.
 */
export const ADMIN_GRANTABLE: readonly Permission[] = ['internship.manage'];

/** Editörlere verilemeyen yetkiler: yetki yükseltmeyi engeller. */
export const ADMIN_ONLY_PERMISSIONS: readonly Permission[] = ['users.manage'];

export function effectivePermissions(role: Role, granted: readonly string[]): Permission[] {
  if (role === 'owner' || role === 'admin') return [...PERMISSION_KEYS];
  return PERMISSION_KEYS.filter((p) => granted.includes(p) && !ADMIN_ONLY_PERMISSIONS.includes(p));
}

export function hasPermission(role: Role, granted: readonly string[], permission: Permission): boolean {
  return effectivePermissions(role, granted).includes(permission);
}
