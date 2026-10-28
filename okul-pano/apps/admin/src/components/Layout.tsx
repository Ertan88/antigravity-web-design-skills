import clsx from 'clsx';
import { Building2, CalendarRange, ChevronRight, ChevronsUpDown, LogOut, Menu, Moon, School, Sun, X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.tsx';
import { useSchool } from '../lib/data.ts';
import { findNav, NAV } from '../lib/nav.ts';
import { useTheme } from '../lib/theme.ts';
import { BrandMark, BrandName } from './Brand.tsx';
import { EmergencyBanner, EmergencyButton } from './Emergency.tsx';
import { WelcomeDialog } from './Onboarding.tsx';
import { TrialBanner } from './TrialBanner.tsx';
import { NotificationBell } from './Notifications.tsx';
import { Spinner } from './ui.tsx';

function SchoolSwitcher() {
  const { me, school, setSchoolId } = useAuth();
  if (!me || me.schools.length === 0) return null;
  const body = (
    <>
      <SchoolBadge name={school?.name ?? ''} logo={school?.logoUrl ?? null} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{school?.name ?? 'Okul seçin'}</div>
        <div className="text-xs text-slate-500">{me.schools.length > 1 ? `${me.schools.length} okul` : school ? (school.support ? 'Destek erişimi' : roleLabel(school.role)) : ''}</div>
      </div>
    </>
  );
  if (me.schools.length === 1) {
    return <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-2.5 ring-1 ring-slate-200/70">{body}</div>;
  }
  return (
    <label className="relative flex items-center gap-3 rounded-2xl bg-slate-50 p-2.5 ring-1 ring-slate-200/70 transition hover:ring-slate-300 focus-within:ring-brand-400">
      {body}
      <ChevronsUpDown className="size-4 text-slate-400" />
      <select
        aria-label="Okul seç"
        className="absolute inset-0 cursor-pointer opacity-0"
        value={school?.id ?? ''}
        onChange={(e) => setSchoolId(e.target.value)}
      >
        {me.schools.map((s) => (
          <option key={s.id} value={s.id}>
            {s.support ? `${s.name} (destek erişimi)` : s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SchoolBadge({ name, logo }: { name: string; logo: string | null }) {
  if (logo) return <img src={logo} alt="" className="size-10 shrink-0 rounded-xl bg-surface object-contain p-0.5" />;
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white shadow-md shadow-brand-600/30">
      {name.trim().charAt(0).toLocaleUpperCase('tr-TR') || <School className="size-4" />}
    </div>
  );
}

const roleLabel = (r: string) => ({ owner: 'Okul sahibi', admin: 'Yönetici', editor: 'Editör' })[r] ?? r;

const initials = (name: string | undefined) =>
  (name ?? '')
    .split(' ')
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('tr-TR');

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-all',
    isActive ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100' : 'text-slate-600 hover:bg-slate-100 hover:text-ink',
  );

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me, can, logout } = useAuth();
  const school = useSchool();
  const settings = school.data?.settings;
  return (
    <div className="relative flex h-full flex-col overflow-hidden border-r border-slate-200/70 bg-surface text-slate-600">
      {/* Hafif arka plan ışıltısı */}
      <div className="pointer-events-none absolute -top-28 -left-28 size-72 rounded-full bg-brand-500/10 blur-3xl" />

      <div className="relative flex items-center gap-2.5 px-5 pt-5 pb-4">
        <BrandMark className="size-9 shrink-0 drop-shadow-sm" />
        <div className="leading-tight">
          <BrandName className="block text-[17px] font-extrabold tracking-tight text-ink" />
          <div className="text-[11px] font-medium text-slate-500">Yönetim Paneli</div>
        </div>
      </div>
      <div className="relative px-3 pb-4">
        <SchoolSwitcher />
      </div>
      <nav className="relative flex-1 space-y-5 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
        {NAV.map((group) => {
          const items = group.items.filter((i) => (!i.permission || can(i.permission)) && (!i.when || i.when(settings)));
          if (!items.length) return null;
          return (
            <div key={group.title || 'root'}>
              {group.title && <div className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-slate-400 uppercase">{group.title}</div>}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={onNavigate} className={navLinkClass}>
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute top-1/2 -left-3 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />}
                        <item.icon className={clsx('size-[18px] shrink-0 transition-colors', isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')} />
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
        {me?.user.isSuperAdmin && (
          <div>
            <div className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-slate-400 uppercase">Platform</div>
            <NavLink to="/platform" end onClick={onNavigate} className={navLinkClass}>
              <Building2 className="size-[18px] text-slate-400" /> Okullar ve Abonelikler
            </NavLink>
            <NavLink to="/platform/takvim" onClick={onNavigate} className={navLinkClass}>
              <CalendarRange className="size-[18px] text-slate-400" /> MEB Çalışma Takvimi
            </NavLink>
          </div>
        )}
      </nav>
      <div className="relative border-t border-slate-200/70 p-3">
        <div className="flex items-center gap-1">
          <NavLink to="/hesap" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-slate-100">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-xs font-bold text-white ring-2 ring-surface">
              {initials(me?.user.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{me?.user.fullName}</div>
              <div className="truncate text-xs text-slate-500">{me?.user.email}</div>
            </div>
          </NavLink>
          <button
            type="button"
            title="Çıkış yap"
            aria-label="Çıkış yap"
            onClick={() => void logout()}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-ink"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
      title={dark ? 'Açık tema' : 'Koyu tema'}
      className="relative flex h-9 w-[4.5rem] items-center rounded-full bg-slate-100 p-1 ring-1 ring-slate-200 transition hover:ring-slate-300"
    >
      <span
        className={clsx(
          'absolute top-1 flex size-7 items-center justify-center rounded-full bg-surface shadow-[0_1px_3px_rgba(15,23,42,0.2)] transition-all duration-300',
          dark ? 'left-[2.375rem]' : 'left-1',
        )}
      />
      <Sun className={clsx('relative z-10 ml-1.5 size-4 transition-colors', dark ? 'text-slate-400' : 'text-amber-500')} />
      <Moon className={clsx('relative z-10 ml-auto mr-1.5 size-4 transition-colors', dark ? 'text-brand-400' : 'text-slate-400')} />
    </button>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const nav = findNav(pathname);
  return (
    <header className="border-b border-slate-200/60 bg-surface/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1680px] items-center gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
        <button type="button" aria-label="Menüyü aç" className="-ml-1 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onMenu}>
          <Menu className="size-5" />
        </button>
        <nav aria-label="Konum" className="flex min-w-0 items-center gap-1.5 text-sm">
          <BrandName className="font-extrabold tracking-tight text-ink lg:hidden" />
          {nav?.group && (
            <>
              <span className="hidden font-medium text-slate-400 lg:inline">{nav.group}</span>
              <ChevronRight className="hidden size-3.5 text-slate-300 lg:block" />
            </>
          )}
          <span className="hidden truncate font-semibold text-slate-800 lg:inline">{nav?.item.label ?? ''}</span>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <EmergencyButton />
          <NotificationBell />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="relative min-h-dvh lg:pl-72">
      {/* İçerik alanının üstünde hafif renk geçişi */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_30%_0%,rgba(59,130,246,0.10),transparent)]" />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            <button
              type="button"
              aria-label="Menüyü kapat"
              className="absolute top-5 right-3 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink"
              onClick={() => setOpen(false)}
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Acil durum bandı ve üst bar birlikte yapışık kalır */}
      <div className="sticky top-0 z-20">
        <EmergencyBanner />
        <TrialBanner />
        <TopBar onMenu={() => setOpen(true)} />
      </div>

      <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
      <WelcomeDialog />
    </div>
  );
}
