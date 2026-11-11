import { ADMIN_GRANTABLE, type Permission } from './permissions.ts';

/**
 * Kişiler ve Yetkiler: tek tek 19 yetki yerine okulun iş bölümüne göre görev paketleri. Veritabanında yetkiler aynen
 * saklanır; paket, içindeki bütün yetkiler verilmişse "açık" sayılır. Pakete girmeyen yetkiler "Diğer yetkiler"dir.
 */
export const DUTY_PACKAGES = [
  { key: 'announcements', label: 'Duyurular', text: 'Duyuru, kayan yazı, başlıklar, başarılar', permissions: ['announcements.manage', 'ticker.manage', 'labels.manage', 'highlights.manage'] },
  { key: 'exams', label: 'Sınavlar', text: 'Sınav takvimi ve sınav sayacı', permissions: ['exams.manage'] },
  { key: 'duties', label: 'Nöbet', text: 'Nöbet çizelgesi ve izinli öğretmenler', permissions: ['duties.manage', 'leaves.manage'] },
  { key: 'schedule', label: 'Ders programı', text: 'Ders programı, sınıflar, zil saatleri', permissions: ['schedule.manage', 'directory.manage'] },
  { key: 'boards', label: 'Panolar', text: 'Ekranlar ve panoları uzaktan yönetme', permissions: ['screens.manage', 'board.control'] },
  { key: 'students', label: 'Öğrenciler', text: 'Öğrenci listesi ve doğum günleri', permissions: ['students.manage'] },
  { key: 'conduct', label: 'Gözlem', text: 'Gözlem kriterleri ve ayın öğrencisi', permissions: ['conduct.manage'] },
] as const satisfies readonly { key: string; label: string; text: string; permissions: readonly Permission[] }[];

export type DutyKey = (typeof DUTY_PACKAGES)[number]['key'];

/** Pakete girmeyen, tek tek verilen yetkiler (dikkatli verilmeli) */
export const EXTRA_PERMISSIONS: readonly { key: Permission; label: string; text: string }[] = [
  { key: 'announcements.approve', label: 'Duyuruları onaylar', text: 'Onay bekleyen duyuruları yayına alır' },
  { key: 'accounts.enroll', label: 'Öğretmen hesabı açar', text: 'Kadrodaki öğretmenlere hesap açar (yalnızca Öğretmen rolüyle)' },
  { key: 'emergency.manage', label: 'Acil durum uyarısı', text: 'Bütün panolarda acil durum uyarısı başlatır' },
  { key: 'settings.manage', label: 'Okul ayarları', text: 'Okul bilgileri, konum ve modüller' },
  { key: 'support.contact', label: 'Platforma yazar', text: 'Okul Yayın ekibine sorun, öneri ya da soru yazar' },
  { key: 'internship.manage', label: 'Mesleki eğitimi yönetir', text: 'Bütün işletmeleri ve öğrencileri görür, koordinatör öğretmenleri işaretler, koordinatör müdür yardımcısını seçer' },
];

/** Kişinin açık görev paketleri (paketin bütün yetkileri verilmişse) */
export const dutiesOf = (permissions: readonly string[]): DutyKey[] =>
  DUTY_PACKAGES.filter((d) => d.permissions.every((p) => permissions.includes(p))).map((d) => d.key);

/** Bir paketin içinden yalnızca bir kısmı verilmiş yetkiler: kişi kartında "eski seçim" olarak gösterilir, silinmez */
export const partialDutyPermissions = (permissions: readonly string[]): Permission[] =>
  DUTY_PACKAGES.filter((d) => !d.permissions.every((p) => permissions.includes(p))).flatMap((d) => d.permissions.filter((p) => permissions.includes(p)));

/** Paketi aç ya da kapat: yetki listesine paketin yetkileri eklenir ya da çıkarılır (diğer yetkiler korunur) */
export function toggleDuty(permissions: readonly string[], key: DutyKey, on: boolean): string[] {
  const pkg = DUTY_PACKAGES.find((d) => d.key === key)!;
  const rest = permissions.filter((p) => !(pkg.permissions as readonly string[]).includes(p));
  return on ? [...rest, ...pkg.permissions] : rest;
}

/**
 * Kişinin paneldeki rolü (5 sabit rol). Veritabanındaki owner/admin/editor + yetki + kadro bağına göre:
 * müdür yardımcısı = Yönetici; rehber öğretmen = gözlem kayıtlarını gören; kadroda olan Öğretmen, olmayan Görevli.
 */
export type PersonRole = 'owner' | 'admin' | 'counselor' | 'teacher' | 'staff';
export const PERSON_ROLES: Record<PersonRole, { label: string; text: string }> = {
  owner: { label: 'Okul müdürü', text: 'Her şey; müdürlüğü devreder' },
  admin: { label: 'Müdür yardımcısı', text: 'Bütün bölümler, kullanıcı ekler' },
  counselor: { label: 'Rehber öğretmen', text: 'Bütün öğrencilerin gözlem kayıtlarını görür' },
  teacher: { label: 'Öğretmen', text: 'Kendi ders programı, nöbeti ve izni; verilen görevler' },
  staff: { label: 'Görevli', text: 'Kadro dışı (ör. memur); yalnızca verilen görevler' },
};

export function personRole(m: { role: string; permissions: readonly string[]; teacherId?: string | null }): PersonRole {
  if (m.role === 'owner') return 'owner';
  if (m.role === 'admin') return 'admin';
  if (m.permissions.includes('conduct.counsel')) return 'counselor';
  return m.teacherId ? 'teacher' : 'staff';
}

/** Kişi kartındaki rol seçimini veritabanı rolüne çevirir (görevler ve diğer yetkiler korunur) */
export function applyPersonRole(role: Exclude<PersonRole, 'owner'>, permissions: readonly string[]): { role: 'admin' | 'editor'; permissions: string[] } {
  // Müdür yardımcısının rolü bütün yetkileri verir; yalnızca açıkça verilenler saklanır (ör. "Mesleki eğitimi yönetir")
  if (role === 'admin') return { role: 'admin', permissions: permissions.filter((p) => (ADMIN_GRANTABLE as readonly string[]).includes(p)) };
  const rest = permissions.filter((p) => p !== 'conduct.counsel' && p !== 'users.manage');
  return { role: 'editor', permissions: role === 'counselor' ? [...rest, 'conduct.counsel'] : rest };
}
