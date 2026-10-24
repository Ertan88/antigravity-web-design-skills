import type { Permission } from '@okulpano/shared';
import { Loader2, Lock, SearchX } from 'lucide-react';
import { lazy, type ComponentType, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { EmptyState } from './components/ui.tsx';
import { useAuth } from './lib/auth.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Login } from './pages/Login.tsx';

/** Sayfalar ihtiyaç anında yüklenir: telefondan giren öğretmen için ilk açılış hızlı olur. */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

const Account = page(() => import('./pages/Account.tsx'), 'Account');
const Announcements = page(() => import('./pages/Announcements.tsx'), 'Announcements');
const Audit = page(() => import('./pages/Audit.tsx'), 'Audit');
const BellSchedules = page(() => import('./pages/BellSchedules.tsx'), 'BellSchedules');
const Duties = page(() => import('./pages/Duties.tsx'), 'Duties');
const Exams = page(() => import('./pages/Exams.tsx'), 'Exams');
const Leaves = page(() => import('./pages/Leaves.tsx'), 'Leaves');
const Platform = page(() => import('./pages/Platform.tsx'), 'Platform');
const Screens = page(() => import('./pages/Screens.tsx'), 'Screens');
const Settings = page(() => import('./pages/Settings.tsx'), 'Settings');
const Students = page(() => import('./pages/Students.tsx'), 'Students');
const Teachers = page(() => import('./pages/Teachers.tsx'), 'Teachers');
const Ticker = page(() => import('./pages/Ticker.tsx'), 'Ticker');
const Timetable = page(() => import('./pages/Timetable.tsx'), 'Timetable');
const Transport = page(() => import('./pages/Transport.tsx'), 'Transport');
const Users = page(() => import('./pages/Users.tsx'), 'Users');

function Guard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <EmptyState
        icon={<Lock className="size-6" />}
        title="Bu sayfa için yetkiniz yok"
        description="Erişim gerekiyorsa okul yöneticinizden ilgili yetkiyi isteyin."
      />
    );
  }
  return children;
}

export function App() {
  const { me, loading, school } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-slate-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (!me) return <Login />;

  const needsSchool = (el: ReactNode) =>
    school ? (
      el
    ) : (
      <EmptyState
        icon={<SearchX className="size-6" />}
        title="Henüz bir okula bağlı değilsiniz"
        description={me.user.isSuperAdmin ? 'Platform bölümünden ilk okulu oluşturun.' : 'Okul yöneticinizden sizi eklemesini isteyin.'}
        action={
          me.user.isSuperAdmin && (
            <Link to="/platform" className="text-sm font-semibold text-brand-600">
              Okul oluştur →
            </Link>
          )
        }
      />
    );

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={needsSchool(<Dashboard />)} />
        <Route path="duyurular" element={needsSchool(<Guard permission="announcements.manage"><Announcements /></Guard>)} />
        <Route path="kayan-yazi" element={needsSchool(<Guard permission="ticker.manage"><Ticker /></Guard>)} />
        <Route path="sinavlar" element={needsSchool(<Guard permission="exams.manage"><Exams /></Guard>)} />
        <Route path="nobet" element={needsSchool(<Guard permission="duties.manage"><Duties /></Guard>)} />
        <Route path="tasimali" element={needsSchool(<Guard permission="duties.manage"><Transport /></Guard>)} />
        <Route path="izinler" element={needsSchool(<Guard permission="leaves.manage"><Leaves /></Guard>)} />
        <Route path="ogrenciler" element={needsSchool(<Guard permission="students.manage"><Students /></Guard>)} />
        <Route path="zil-saatleri" element={needsSchool(<Guard permission="schedule.manage"><BellSchedules /></Guard>)} />
        <Route path="ders-programi" element={needsSchool(<Guard permission="schedule.manage"><Timetable /></Guard>)} />
        <Route path="ogretmenler" element={needsSchool(<Guard permission="directory.manage"><Teachers /></Guard>)} />
        {/* Sınıflar artık ders programı sayfasında */}
        <Route path="siniflar" element={<Navigate to="/ders-programi" replace />} />
        <Route path="ekranlar" element={needsSchool(<Guard permission="screens.manage"><Screens /></Guard>)} />
        <Route path="kullanicilar" element={needsSchool(<Guard permission="users.manage"><Users /></Guard>)} />
        <Route path="ayarlar" element={needsSchool(<Guard permission="settings.manage"><Settings /></Guard>)} />
        <Route path="gecmis" element={needsSchool(<Guard permission="users.manage"><Audit /></Guard>)} />
        <Route path="hesap" element={<Account />} />
        <Route path="platform" element={me.user.isSuperAdmin ? <Platform /> : null} />
        <Route
          path="*"
          element={<EmptyState icon={<SearchX className="size-6" />} title="Sayfa bulunamadı" action={<Link to="/" className="text-sm font-semibold text-brand-600">Genel bakışa dön</Link>} />}
        />
      </Route>
    </Routes>
  );
}
