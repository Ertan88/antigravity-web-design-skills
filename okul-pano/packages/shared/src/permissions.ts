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
  'exams.manage': 'Sınav sayacı',
  'duties.manage': 'Nöbet çizelgesi',
  'leaves.manage': 'İzinli öğretmenler',
  'students.manage': 'Öğrenciler ve doğum günleri',
  'directory.manage': 'Öğretmenler ve sınıflar',
  'schedule.manage': 'Zil saatleri ve ders programı',
  'screens.manage': 'Ekranlar',
  'settings.manage': 'Okul ayarları',
  'labels.manage': 'Başlıkları düzenleme',
  'users.manage': 'Kullanıcılar ve yetkiler',
  'conduct.manage': 'Gözlem kriterleri ve ayın öğrencisi',
  /** Rehber öğretmen: bütün öğrencilerin gözlem kayıtlarını görür (panelde "Rehber öğretmen" rolü olarak verilir) */
  'conduct.counsel': 'Rehber öğretmen (bütün gözlem kayıtları)',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export const ROLES = {
  owner: 'Okul sahibi',
  admin: 'Yönetici',
  editor: 'Editör',
} as const;

export type Role = keyof typeof ROLES;

/** Editörlere verilemeyen yetkiler: yetki yükseltmeyi engeller. */
export const ADMIN_ONLY_PERMISSIONS: readonly Permission[] = ['users.manage'];

export function effectivePermissions(role: Role, granted: readonly string[]): Permission[] {
  if (role === 'owner' || role === 'admin') return [...PERMISSION_KEYS];
  return PERMISSION_KEYS.filter((p) => granted.includes(p) && !ADMIN_ONLY_PERMISSIONS.includes(p));
}

export function hasPermission(role: Role, granted: readonly string[], permission: Permission): boolean {
  return effectivePermissions(role, granted).includes(permission);
}
