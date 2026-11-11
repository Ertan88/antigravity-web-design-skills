import type { Permission, SchoolSettings } from '@okulpano/shared';
import {
  AlertTriangle,
  Lifebuoy2,
  BellRing,
  Cake,
  CalendarClock,
  CalendarRange,
  CalendarDays,
  ClipboardCheck,
  Gauge,
  Building2,
  CalendarCheck2,
  HeartHandshake,
  ListChecks,
  Star,
  GraduationCap,
  History,
  Library,
  LayoutDashboard,
  Megaphone,
  MonitorSmartphone,
  Settings,
  ShieldCheck,
  TextCursorInput,
  Type,
  Trophy,
  UserCog,
  UserMinus,
  Users,
  type LucideIcon,
} from '../components/icons.tsx';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Menüde görünmesi için gereken yetki (yoksa tüm üyeler görür) */
  permission?: Permission;
  /** Okul ayarına bağlı modüller (ör. taşımalı eğitim yalnızca açıksa görünür) */
  when?: (settings: SchoolSettings | undefined, who: { userId: string | null; teacherId: string | null; vocational: boolean; can: (p: Permission) => boolean }) => boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Gruplar konuya göre (web ve mobilde aynı ad ve sıra): Pano · Takvim ve Ders · Personel · Öğrenciler ·
 * Mesleki Eğitim · İletişim · Yönetim. Yetkisi olmayan kişide boş kalan grup görünmez.
 */
export const NAV: NavGroup[] = [
  { title: '', items: [{ to: '/', label: 'Genel Bakış', icon: LayoutDashboard }] },
  {
    title: 'Pano',
    items: [
      { to: '/duyurular', label: 'Duyurular', icon: Megaphone, permission: 'announcements.manage' },
      { to: '/kayan-yazi', label: 'Kayan Yazı', icon: TextCursorInput, permission: 'ticker.manage' },
      { to: '/sinavlar', label: 'Sınav Sayacı', icon: GraduationCap, permission: 'exams.manage' },
      { to: '/basarilar', label: 'Başarılar', icon: Trophy, permission: 'highlights.manage' },
      { to: '/etkinlikler', label: 'Etkinlik Takvimi', icon: CalendarDays, permission: 'highlights.manage' },
      { to: '/haftanin-kitabi', label: 'Haftanın Kitabı', icon: Library, permission: 'highlights.manage' },
      { to: '/basliklar', label: 'Başlıklar', icon: Type, permission: 'labels.manage' },
      { to: '/ekranlar', label: 'Panolar', icon: MonitorSmartphone, permission: 'screens.manage' },
    ],
  },
  {
    title: 'Takvim ve Ders',
    items: [
      { to: '/ders-programi', label: 'Ders Programı ve Sınıflar', icon: CalendarClock, permission: 'schedule.manage' },
      { to: '/zil-saatleri', label: 'Zil Saatleri', icon: BellRing, permission: 'schedule.manage' },
      { to: '/sinav-takvimi', label: 'Sınav Takvimi', icon: ClipboardCheck },
      // Herkes görür; tatil ekleme Nöbet yetkisiyle, MEB takvimini düzeltme yalnızca platform yöneticisinde
      { to: '/tatil-takvimi', label: 'Tatil Takvimi', icon: CalendarRange },
    ],
  },
  {
    title: 'Personel',
    items: [
      { to: '/ogretmenler', label: 'Öğretmen Kadrosu', icon: Users, permission: 'directory.manage' },
      { to: '/nobet', label: 'Nöbet Çizelgesi', icon: ShieldCheck, permission: 'duties.manage' },
      { to: '/izinler', label: 'İzinli Öğretmenler', icon: UserMinus, permission: 'leaves.manage' },
    ],
  },
  {
    title: 'Öğrenciler',
    items: [
      { to: '/ogrenciler', label: 'Öğrenciler', icon: Cake, permission: 'students.manage' },
      { to: '/gozlem', label: 'Öğrenci Gözlemleri', icon: ClipboardCheck, permission: 'conduct.counsel' },
      { to: '/ayin-ogrencisi', label: 'Ayın Öğrencisi', icon: Star, permission: 'conduct.counsel' },
      { to: '/donem-gostergesi', label: 'Dönem Göstergesi', icon: Gauge, permission: 'conduct.counsel' },
      { to: '/rehberlik', label: 'Rehberlik Uyarıları', icon: HeartHandshake, permission: 'conduct.counsel' },
      { to: '/gozlem-kriterleri', label: 'Gözlem Kriterleri', icon: ListChecks, permission: 'conduct.manage' },
    ],
  },
  {
    title: 'Mesleki Eğitim',
    items: [
      // İdare bütün işletmeleri, meslek öğretmeni kendi eklediği ya da koordinatörü olduğu işletmeleri görür
      {
        to: '/isletmeler',
        label: 'İşletmeler',
        icon: Building2,
        when: (s, who) => Boolean(s?.internshipEnabled) && (who.can('internship.manage') || who.vocational),
      },
      {
        to: '/isletme-devam',
        label: 'İşletmede Devam',
        icon: CalendarCheck2,
        // İdare, koordinatör müdür yardımcısı ve meslek öğretmenleri (koordinatör öğretmen kendi işletmelerini görür)
        when: (s, who) => Boolean(s?.internshipEnabled) && (who.can('internship.manage') || who.vocational || s?.internshipManagerUserId === who.userId),
      },
    ],
  },
  {
    title: 'İletişim',
    items: [
      // Herkes bildirir; idare pano görünümünde yönetir
      { to: '/sorunlar', label: 'Okul Sorunları', icon: AlertTriangle },
      // Okul müdürü ve yöneticiler (kullanıcı yönetimi yetkisi yalnız onlarda) platforma yazar
      { to: '/platforma-yaz', label: 'Platforma Yaz', icon: Lifebuoy2, permission: 'users.manage' },
    ],
  },
  {
    title: 'Yönetim',
    items: [
      // Dar yetki "Öğretmen hesabı açma" olan kişi yalnızca Kadro sekmesini görür
      { to: '/kullanicilar', label: 'Kişiler ve Yetkiler', icon: UserCog, when: (_s, who) => who.can('users.manage') || who.can('accounts.enroll') },
      { to: '/ayarlar', label: 'Genel Ayarlar', icon: Settings, permission: 'settings.manage' },
      { to: '/gecmis', label: 'Etkinlik Geçmişi', icon: History, permission: 'users.manage' },
    ],
  },
];

/** Adrese karşılık gelen menü öğesi ve grubu (sayfa başlığındaki simge ve üst başlık için) */
export function findNav(pathname: string): { group: string; item: NavItem } | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const g of NAV) for (const item of g.items) if (item.to === path) return { group: g.title, item };
  return null;
}
