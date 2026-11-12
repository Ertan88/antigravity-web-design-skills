import type { Permission } from '@okulpano/shared/permissions';
import { useAuth, type AppRole } from './auth.tsx';

export type TabName =
  | 'index'
  | 'onaylar'
  | 'panolar'
  | 'nobet'
  | 'acil'
  | 'duyurular'
  | 'gorevlendirme'
  | 'gozlem'
  | 'izinlerim'
  | 'program'
  | 'okullar'
  | 'takvim'
  | 'kutu'
  | 'profil';

/**
 * Alt menü role göre kurulur (en çok 5 sekme; son sekme Menü, geri kalanı Menü'de):
 * - Platform yöneticisi: Platform · Abonelikler · Takvim · Bildirimler
 * - Okul müdürü ve müdür yardımcısı: Merkez · Duyurular · Onaylar · Panolar · Menü (Acil başlıkta, Nöbet Merkez'den)
 * - Kadro dışı görevli (editör): İçerik + en çok 3 görev sekmesi + Menü; Acil yetkisi varsa Acil hiç düşmez
 * - Öğretmen (görevi olan da): Bugün · Nöbetim · Gözlem · Program ya da ilk görevi · Menü
 * - Kadro dışı, görevi yok: Ana sayfa · Menü
 */
export function visibleTabs(role: AppRole, can: (p: Permission) => boolean, isTeacher: boolean): TabName[] {
  switch (role) {
    case 'platform':
      return ['index', 'okullar', 'takvim', 'kutu'];
    case 'owner':
    case 'admin':
      return ['index', 'duyurular', 'onaylar', 'panolar', 'profil'];
    case 'editor': {
      const tasks: TabName[] = [];
      if (can('announcements.manage')) tasks.push('duyurular');
      if (can('announcements.approve') || can('leaves.manage')) tasks.push('onaylar');
      if (can('board.control') || can('screens.manage')) tasks.push('panolar');
      if (can('duties.manage')) tasks.push('nobet');
      const picked = can('emergency.manage') ? [...tasks.slice(0, 2), 'acil' as const] : tasks.slice(0, 3);
      return ['index', ...picked, 'profil'];
    }
    default: {
      // Hesabı olan ama kadroda olmayan (ör. memur): ders, nöbet ve gözlem ekranları ona boş kalır
      if (!isTeacher) return ['index', 'profil'];
      // Görevi olan öğretmen kendi ekranlarını kaybetmez; ilk görevi Program'ın yerine gelir (Program, Bugün'deki karttan da açılır)
      const task: TabName = can('announcements.manage')
        ? 'duyurular'
        : can('duties.manage')
          ? 'gorevlendirme'
          : can('announcements.approve') || can('leaves.manage')
            ? 'onaylar'
            : can('board.control') || can('screens.manage')
              ? 'panolar'
              : 'program';
      return ['index', 'nobet', 'gozlem', task, 'profil'];
    }
  }
}

export function useVisibleTabs(): TabName[] {
  const { role, can, isTeacher } = useAuth();
  return visibleTabs(role, can, isTeacher);
}

/** Ekran alt menüde değilse (Merkez'den, Menü'den ya da bildirimden açıldıysa) başlıkta geri düğmesi gösterilir */
export function useTabBack(name: TabName): boolean {
  return !useVisibleTabs().includes(name);
}

/** Acil yetkisi olup alt menüde Acil sekmesi olmayan kişide Acil düğmesi her ekranın başlığında durur */
export function useEmergencyInHeader(): boolean {
  const { role, can } = useAuth();
  const tabs = useVisibleTabs();
  return role !== 'platform' && can('emergency.manage') && !tabs.includes('acil');
}
