import type { Permission, SchoolSettings } from '@okulpano/shared';
import {
  BellRing,
  Cake,
  CalendarClock,
  CalendarRange,
  CalendarDays,
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
      { to: '/ogretmenler', label: 'Öğretmen Kadrosu', icon: Users, permission: 'directory.manage' },
      { to: '/nobet', label: 'Nöbet Çizelgesi', icon: ShieldCheck, permission: 'duties.manage' },
      { to: '/izinler', label: 'İzinli Öğretmenler', icon: UserMinus, permission: 'leaves.manage' },
      { to: '/ogrenciler', label: 'Doğum Günleri', icon: Cake, permission: 'students.manage' },
      { to: '/basarilar', label: 'Başarılar', icon: Trophy, permission: 'highlights.manage' },
      { to: '/etkinlikler', label: 'Etkinlik Takvimi', icon: CalendarDays, permission: 'highlights.manage' },
      { to: '/haftanin-kitabi', label: 'Haftanın Kitabı', icon: Library, permission: 'highlights.manage' },
    ],
  },
  {
    title: 'Ders Düzeni',
    items: [
      { to: '/zil-saatleri', label: 'Zil Saatleri', icon: BellRing, permission: 'schedule.manage' },
      // Herkes görür; tatil ekleme Nöbet yetkisiyle, MEB takvimini düzeltme yalnızca platform yöneticisinde
      { to: '/tatil-takvimi', label: 'Tatil Takvimi', icon: CalendarRange },
      { to: '/ders-programi', label: 'Ders Programı ve Sınıflar', icon: CalendarClock, permission: 'schedule.manage' },
    ],
  },
  {
    title: 'Yönetim',
    items: [
      { to: '/ekranlar', label: 'Panolar', icon: MonitorSmartphone, permission: 'screens.manage' },
      { to: '/kullanicilar', label: 'Kullanıcılar ve Yetkiler', icon: UserCog, permission: 'users.manage' },
      { to: '/ayarlar', label: 'Genel Ayarlar', icon: Settings, permission: 'settings.manage' },
      { to: '/basliklar', label: 'Başlıklar', icon: Type, permission: 'labels.manage' },
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
