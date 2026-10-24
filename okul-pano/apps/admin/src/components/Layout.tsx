import clsx from 'clsx';
import { Building2, ChevronRight, ChevronsUpDown, LogOut, Menu, MonitorSmartphone, School, X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.tsx';
import { useSchool } from '../lib/data.ts';
import { findNav, NAV } from '../lib/nav.ts';
import { Spinner } from './ui.tsx';

function SchoolSwitcher() {
  const { me, school, setSchoolId } = useAuth();
  if (!me || me.schools.length === 0) return null;
  const body = (
    <>
      <SchoolBadge name={school?.name ?? ''} logo={school?.logoUrl ?? null} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{school?.name ?? 'Okul seçin'}</div>
        <div className="text-xs text-slate-400">{me.schools.length > 1 ? `${me.schools.length} okul` : school ? roleLabel(school.role) : ''}</div>
      </div>
    </>
  );
  if (me.schools.length === 1) {
    return <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-2.5 ring-1 ring-white/10">{body}</div>;
  }
  return (
    <label className="relative flex items-center gap-3 rounded-2xl bg-white/[0.06] p-2.5 ring-1 ring-white/10 transition hover:bg-white/10 focus-within:ring-brand-400">
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
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SchoolBadge({ name, logo }: { name: string; logo: string | null }) {
  if (logo) return <img src={logo} alt="" className="size-10 shrink-0 rounded-xl bg-white object-contain p-0.5" />;
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-brand-900/40">
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
    isActive
      ? 'bg-gradient-to-r from-white/[0.14] to-white/[0.04] text-white shadow-sm ring-1 ring-white/10'
      : 'text-slate-400 hover:bg-white/[0.06] hover:text-white',
  );

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me, can, logout } = useAuth();
  const school = useSchool();
  const settings = school.data?.settings;
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-slate-950 text-slate-300">
      {/* Arka plan ışıltısı */}
      <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-brand-600/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 size-72 rounded-full bg-indigo-600/15 blur-3xl" />

      <div className="relative flex items-center gap-2.5 px-5 pt-5 pb-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-indigo-600 text-white shadow-lg shadow-brand-900/50">
          <MonitorSmartphone className="size-[18px]" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-white">Okul Pano</div>
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
              {group.title && <div className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-slate-500 uppercase">{group.title}</div>}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={onNavigate} className={navLinkClass}>
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute top-1/2 -left-3 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />}
                        <item.icon className={clsx('size-[18px] shrink-0 transition-colors', isActive ? 'text-brand-300' : 'text-slate-500 group-hover:text-slate-300')} />
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
            <div className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-slate-500 uppercase">Platform</div>
            <NavLink to="/platform" onClick={onNavigate} className={navLinkClass}>
              <Building2 className="size-[18px] text-slate-500" /> Okullar ve Abonelikler
            </NavLink>
          </div>
        )}
      </nav>
      <div className="relative border-t border-white/[0.07] p-3">
        <div className="flex items-center gap-1">
          <NavLink to="/hesap" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-white/[0.06]">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-xs font-bold text-white ring-2 ring-white/10">
              {initials(me?.user.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{me?.user.fullName}</div>
              <div className="truncate text-xs text-slate-500">{me?.user.email}</div>
            </div>
          </NavLink>
          <button
            type="button"
            title="Çıkış yap"
            aria-label="Çıkış yap"
            onClick={() => void logout()}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const nav = findNav(pathname);
  const { me } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1680px] items-center gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
        <button type="button" aria-label="Menüyü aç" className="-ml-1 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onMenu}>
          <Menu className="size-5" />
        </button>
        <nav aria-label="Konum" className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="font-bold tracking-tight text-slate-900 lg:hidden">Okul Pano</span>
          {nav?.group && (
            <>
              <span className="hidden font-medium text-slate-400 lg:inline">{nav.group}</span>
              <ChevronRight className="hidden size-3.5 text-slate-300 lg:block" />
            </>
          )}
          <span className="hidden truncate font-semibold text-slate-800 lg:inline">{nav?.item.label ?? ''}</span>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:inline">{dateFmt.format(new Date())}</span>
          <NavLink
            to="/hesap"
            title="Hesabım"
            className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 text-[11px] font-bold text-white shadow-sm ring-2 ring-white"
          >
            {initials(me?.user.fullName)}
          </NavLink>
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
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            <button
              type="button"
              aria-label="Menüyü kapat"
              className="absolute top-5 right-3 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <TopBar onMenu={() => setOpen(true)} />

      <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
