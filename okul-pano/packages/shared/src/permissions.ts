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
  /**
   * Rol ve görev verir (müdür ve müdür yardımcısının yetkilendirdiği kişi): öğretmen, rehber öğretmen ve editörlere rol
   * ve görev verir. Yalnızca kendisinde olan görevleri verebilir; kendi yetkilerini, müdürü ve müdür yardımcılarını
   * değiştiremez, bu yetkiyi başkasına veremez, hesap açamaz, şifre sıfırlayamaz.
   */
  'roles.assign': 'Rol ve görev verir',
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

/** "Rol ve görev verir" yetkisini yalnızca okul müdürü ve müdür yardımcısı verir; bu yetkiyle başkasına verilemez */
export const ASSIGNER_GRANTABLE_EXCLUDED: readonly Permission[] = ['users.manage', 'roles.assign'];

/**
 * "Rol ve görev verir" yetkisiyle yapılan değişiklikte kişinin yeni yetkileri: verenin kendisinde olmayan yetkiler
 * olduğu gibi kalır (veren onlara dokunamaz), verenin kendisinde olanlar istenene göre verilir ya da alınır. Rehber
 * öğretmen (conduct.counsel) bir roldür; veren kişide olmasa da verilebilir.
 */
export function assignablePermissions(assigner: readonly string[], current: readonly string[], requested: readonly string[]): Permission[] {
  const mine = new Set<string>([...assigner.filter((p) => !(ASSIGNER_GRANTABLE_EXCLUDED as readonly string[]).includes(p)), 'conduct.counsel']);
  const kept = current.filter((p) => !mine.has(p));
  const given = requested.filter((p) => mine.has(p));
  return effectivePermissions('editor', [...new Set([...kept, ...given])]);
}

export function effectivePermissions(role: Role, granted: readonly string[]): Permission[] {
  if (role === 'owner' || role === 'admin') return [...PERMISSION_KEYS];
  return PERMISSION_KEYS.filter((p) => granted.includes(p) && !ADMIN_ONLY_PERMISSIONS.includes(p));
}

export function hasPermission(role: Role, granted: readonly string[], permission: Permission): boolean {
  return effectivePermissions(role, granted).includes(permission);
}

/**
 * İçerik ve yönetim yetkileri: öğretmen kaydı olmayan kişide bunlardan biri varsa uygulamada "editör" (görevli)
 * görünümü açılır. Mobil uygulama ve panelin telefon görünümü aynı kuralı kullanır.
 */
export const CONTENT_PERMISSIONS: readonly Permission[] = [
  'announcements.manage',
  'highlights.manage',
  'ticker.manage',
  'exams.manage',
  'students.manage',
  'announcements.approve',
  'board.control',
  'screens.manage',
  'emergency.manage',
  'duties.manage',
  'leaves.manage',
];

/**
 * Kişinin uygulamadaki görünümü: okul müdürü ve müdür yardımcısı "manager"; öğretmen kaydı olan herkes, görevi olsa
 * da "teacher" (görevi alt menüye ve Menü'ye eklenir); kadroda olmayıp içerik ya da yönetim görevi olan "editor";
 * kadroda olmayan ve görevi olmayan "teacher" (yalnızca ana sayfa ve Menü).
 */
export function appView(m: { role: Role; permissions: readonly string[]; teacherId?: string | null }): 'manager' | 'editor' | 'teacher' {
  if (m.role === 'owner' || m.role === 'admin') return 'manager';
  if (!m.teacherId && CONTENT_PERMISSIONS.some((p) => m.permissions.includes(p))) return 'editor';
  return 'teacher';
}
