import type { Permission } from '@okulpano/shared';
import clsx from 'clsx';
import {
  BellRing,
  BookOpenCheck,
  Building2,
  Cake,
  CalendarClock,
  ChevronsUpDown,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MonitorSmartphone,
  School,
  Settings,
  ShieldCheck,
  TextCursorInput,
  UserCog,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { Suspense, useEffect, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.tsx';
import { Spinner } from './ui.tsx';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Menüde görünmesi için gereken yetki (yoksa tüm üyeler görür) */
  permission?: Permission;
}

const NAV: { title: string; items: NavItem[] }[] = [
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
      { to: '/izinler', label: 'İzinli Öğretmenler', icon: UserMinus, permission: 'leaves.manage' },
      { to: '/ogrenciler', label: 'Doğum Günleri', icon: Cake, permission: 'students.manage' },
    ],
  },
  {
    title: 'Ders Düzeni',
    items: [
      { to: '/zil-saatleri', label: 'Zil Saatleri', icon: BellRing, permission: 'schedule.manage' },
      { to: '/ders-programi', label: 'Ders Programı', icon: CalendarClock, permission: 'schedule.manage' },
      { to: '/ogretmenler', label: 'Öğretmen Kadrosu', icon: Users, permission: 'directory.manage' },
      { to: '/siniflar', label: 'Sınıflar', icon: BookOpenCheck, permission: 'directory.manage' },
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

function SchoolSwitcher() {
  const { me, school, setSchoolId } = useAuth();
  if (!me || me.schools.length === 0) return null;
  if (me.schools.length === 1) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200/70">
        <SchoolBadge name={school?.name ?? ''} logo={school?.logoUrl ?? null} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{school?.name}</div>
          <div className="text-xs text-slate-500">{school ? roleLabel(school.role) : ''}</div>
        </div>
      </div>
    );
  }
  return (
    <label className="relative flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200/70 focus-within:ring-brand-500">
      <SchoolBadge name={school?.name ?? ''} logo={school?.logoUrl ?? null} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900">{school?.name ?? 'Okul seçin'}</div>
        <div className="text-xs text-slate-500">{me.schools.length} okul</div>
      </div>
      <ChevronsUpDown className="size-4 text-slate-400" />
      <select
        aria-label="Okul seç"
        className="absolute inset-0 cursor-pointer opacity-0"
        value={school?.id ?? ''}
        onChange={(e) => setSchoolId(e.target.value)}
      >
        {me.schools.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SchoolBadge({ name, logo }: { name: string; logo: string | null }) {
  if (logo) return <img src={logo} alt="" className="size-9 shrink-0 rounded-lg bg-white object-contain ring-1 ring-slate-200" />;
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
      {name.trim().charAt(0).toLocaleUpperCase('tr-TR') || <School className="size-4" />}
    </div>
  );
}

const roleLabel = (r: string) => ({ owner: 'Okul sahibi', admin: 'Yönetici', editor: 'Editör' })[r] ?? r;

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me, can, logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
          <MonitorSmartphone className="size-4.5" />
        </div>
        <span className="text-[15px] font-bold tracking-tight">Okul Pano</span>
      </div>
      <div className="px-3 pb-3">
        <SchoolSwitcher />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.permission || can(i.permission));
          if (!items.length) return null;
          return (
            <div key={group.title || 'root'}>
              {group.title && <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{group.title}</div>}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )
                    }
                  >
                    <item.icon className="size-4.5 shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
        {me?.user.isSuperAdmin && (
          <div>
            <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Platform</div>
            <NavLink
              to="/platform"
              onClick={onNavigate}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              <Building2 className="size-4.5" /> Okullar ve Abonelikler
            </NavLink>
          </div>
        )}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <NavLink
          to="/hesap"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-slate-100"
        >
          <div className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
            {me?.user.fullName
              .split(' ')
              .map((p) => p.charAt(0))
              .slice(0, 2)
              .join('')
              .toLocaleUpperCase('tr-TR')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{me?.user.fullName}</div>
            <div className="truncate text-xs text-slate-500">{me?.user.email}</div>
          </div>
        </NavLink>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut className="size-4.5" /> Çıkış yap
        </button>
      </div>
    </div>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-dvh lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200/70 bg-white lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button
              type="button"
              aria-label="Menüyü kapat"
              className="absolute top-4 right-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              onClick={() => setOpen(false)}
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur lg:hidden">
        <button type="button" aria-label="Menüyü aç" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" onClick={() => setOpen(true)}>
          <Menu className="size-5" />
        </button>
        <span className="font-bold tracking-tight">Okul Pano</span>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
