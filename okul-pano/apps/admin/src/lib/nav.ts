import type { Permission, SchoolSettings } from '@okulpano/shared';
import {
  BellRing,
  Bus,
  Cake,
  CalendarClock,
  GraduationCap,
  History,
  LayoutDashboard,
  Megaphone,
  MonitorSmartphone,
  Settings,
  ShieldCheck,
  TextCursorInput,
  UserCog,
  UserMinus,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Menüde görünmesi için gereken yetki (yoksa tüm üyeler görür) */
  permission?: Permission;
  /** Okul ayarına bağlı modüller (ör. taşımalı eğitim yalnızca açıksa görünür) */
  when?: (settings: SchoolSettings | undefined) => boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { title: '', items: [{ to: '/', label: 'Genel Bakış', icon: LayoutDashboard }] },
  {
    title: 'Pano İçeriği',
    items: [
      { to: '/duyurular', label: 'Duyurular', icon: Megaphone, permission: 'announcements.manage' },
      { to: '/kayan-yazi', label: 'Kayan Yazı', icon: TextCursorInput, permission: 'ticker.manage' },
      { to: '/sinavlar', label: 'Sınav Sayacı', icon: GraduationCap, permission: 'exams.manage' },
    ],
  },
  {
    title: 'Okul Hayatı',
    items: [
      { to: '/nobet', label: 'Nöbet Çizelgesi', icon: ShieldCheck, permission: 'duties.manage' },
      { to: '/tasimali', label: 'Taşımalı Eğitim', icon: Bus, permission: 'duties.manage', when: (s) => Boolean(s?.hasTransport) },
      { to: '/izinler', label: 'İzinli Öğretmenler', icon: UserMinus, permission: 'leaves.manage' },
      { to: '/ogrenciler', label: 'Doğum Günleri', icon: Cake, permission: 'students.manage' },
      { to: '/ogretmenler', label: 'Öğretmen Kadrosu', icon: Users, permission: 'directory.manage' },
    ],
  },
  {
    title: 'Ders Düzeni',
    items: [
      { to: '/zil-saatleri', label: 'Zil Saatleri', icon: BellRing, permission: 'schedule.manage' },
      { to: '/ders-programi', label: 'Ders Programı ve Sınıflar', icon: CalendarClock, permission: 'schedule.manage' },
    ],
  },
  {
    title: 'Yönetim',
    items: [
      { to: '/ekranlar', label: 'Ekranlar', icon: MonitorSmartphone, permission: 'screens.manage' },
      { to: '/kullanicilar', label: 'Kullanıcılar ve Yetkiler', icon: UserCog, permission: 'users.manage' },
      { to: '/ayarlar', label: 'Okul Ayarları', icon: Settings, permission: 'settings.manage' },
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
