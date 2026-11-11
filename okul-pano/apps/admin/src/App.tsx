import type { Permission } from '@okulpano/shared';
import { ArrowRight, Loader2, Lock, SearchX } from './components/icons.tsx';
import { lazy, useState, type ComponentType, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { Button, EmptyState } from './components/ui.tsx';
import { useAuth } from './lib/auth.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Login } from './pages/Login.tsx';
import { AcceptInvite, Signup, VerifySignup } from './pages/Public.tsx';

/** Sayfalar ihtiyaç anında yüklenir: telefondan giren öğretmen için ilk açılış hızlı olur. */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

const Account = page(() => import('./pages/Account.tsx'), 'Account');
const MyCoversPage = page(() => import('./pages/covers/Covers.tsx'), 'MyCoversPage');
const AssignmentsPage = page(() => import('./pages/covers/Covers.tsx'), 'AssignmentsPage');
const Announcements = page(() => import('./pages/Announcements.tsx'), 'Announcements');
const Audit = page(() => import('./pages/Audit.tsx'), 'Audit');
const BellSchedules = page(() => import('./pages/BellSchedules.tsx'), 'BellSchedules');
const Duties = page(() => import('./pages/Duties.tsx'), 'Duties');
const Exams = page(() => import('./pages/Exams.tsx'), 'Exams');
const ExamSchedule = page(() => import('./pages/ExamSchedule.tsx'), 'ExamSchedule');
const Issues = page(() => import('./pages/Issues.tsx'), 'Issues');
const SupportPage = page(() => import('./pages/Support.tsx'), 'SupportPage');
const PlatformSupportPage = page(() => import('./pages/Support.tsx'), 'PlatformSupportPage');
const MailSettingsPage = page(() => import('./pages/platform/MailSettings.tsx'), 'MailSettingsPage');
const Achievements = page(() => import('./pages/SchoolLife.tsx'), 'Achievements');
const Events = page(() => import('./pages/SchoolLife.tsx'), 'Events');
const Books = page(() => import('./pages/SchoolLife.tsx'), 'Books');
const Leaves = page(() => import('./pages/Leaves.tsx'), 'Leaves');
const Platform = page(() => import('./pages/Platform.tsx'), 'Platform');
const HolidayCalendar = page(() => import('./pages/HolidayCalendar.tsx'), 'HolidayCalendar');
const NotificationsPage = page(() => import('./pages/NotificationsPage.tsx'), 'NotificationsPage');
const Screens = page(() => import('./pages/Screens.tsx'), 'Screens');
const Settings = page(() => import('./pages/Settings.tsx'), 'Settings');
const Labels = page(() => import('./pages/Labels.tsx'), 'Labels');
const Students = page(() => import('./pages/Students.tsx'), 'Students');
const Teachers = page(() => import('./pages/Teachers.tsx'), 'Teachers');
const Ticker = page(() => import('./pages/Ticker.tsx'), 'Ticker');
const Timetable = page(() => import('./pages/Timetable.tsx'), 'Timetable');
const Users = page(() => import('./pages/Users.tsx'), 'Users');
const ConductStudents = page(() => import('./pages/Conduct.tsx'), 'ConductStudents');
const MonthStudent = page(() => import('./pages/Conduct.tsx'), 'MonthStudent');
const ConductCriteria = page(() => import('./pages/Conduct.tsx'), 'ConductCriteria');
const ConductReport = page(() => import('./pages/Conduct.tsx'), 'ConductReport');
const ConductAlerts = page(() => import('./pages/Conduct.tsx'), 'ConductAlerts');
const InternshipSheet = page(() => import('./pages/Internship.tsx'), 'InternshipSheet');
const Businesses = page(() => import('./pages/Internship.tsx'), 'Businesses');

function Guard({ permission, children }: { permission: Permission | Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!(Array.isArray(permission) ? permission.some((p) => can(p)) : can(permission))) {
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
  // Giriş yapılmamışken: kayıt, e-posta doğrulama ve davet sayfaları; diğer her adres giriş ekranı
  if (!me) {
    return (
      <Routes>
        <Route path="kayit" element={<Signup />} />
        <Route path="dogrula" element={<VerifySignup />} />
        <Route path="davet" element={<AcceptInvite />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

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
            <Link to="/platform" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
              Okul oluştur <ArrowRight className="size-4" />
            </Link>
          )
        }
      />
    );

  return (
    <Routes>
      {/* Davet ve doğrulama bağlantıları oturum açıkken de açılır: başka hesapla girilmişse önce çıkış önerilir */}
      <Route path="davet" element={<SignedInLink kind="invite" />} />
      <Route path="dogrula" element={<SignedInLink kind="verify" />} />
      <Route element={<Layout />}>
        <Route index element={needsSchool(<Dashboard />)} />
        <Route path="duyurular" element={needsSchool(<Guard permission="announcements.manage"><Announcements /></Guard>)} />
        <Route path="kayan-yazi" element={needsSchool(<Guard permission="ticker.manage"><Ticker /></Guard>)} />
        <Route path="sinavlar" element={needsSchool(<Guard permission="exams.manage"><Exams /></Guard>)} />
        <Route path="sinav-takvimi" element={needsSchool(<ExamSchedule />)} />
        <Route path="sorunlar" element={needsSchool(<Issues />)} />
        <Route path="platforma-yaz" element={needsSchool(<SupportPage />)} />
        <Route path="platform/destek" element={me.user.isSuperAdmin ? <PlatformSupportPage /> : null} />
        <Route path="platform/e-posta" element={me.user.isSuperAdmin ? <MailSettingsPage /> : null} />
        <Route path="basarilar" element={needsSchool(<Guard permission="highlights.manage"><Achievements /></Guard>)} />
        <Route path="etkinlikler" element={needsSchool(<Guard permission="highlights.manage"><Events /></Guard>)} />
        <Route path="haftanin-kitabi" element={needsSchool(<Guard permission="highlights.manage"><Books /></Guard>)} />
        <Route path="nobet" element={needsSchool(<Guard permission="duties.manage"><Duties /></Guard>)} />
        <Route path="gorevlerim" element={needsSchool(<MyCoversPage />)} />
        <Route path="gorevlendirme" element={needsSchool(<Guard permission="duties.manage"><AssignmentsPage /></Guard>)} />
        <Route path="tasimali" element={<Navigate to="/nobet?bolum=tasimali" replace />} />
        <Route path="izinler" element={needsSchool(<Guard permission="leaves.manage"><Leaves /></Guard>)} />
        <Route path="ogrenciler" element={needsSchool(<Guard permission="students.manage"><Students /></Guard>)} />
        <Route path="gozlem" element={needsSchool(<Guard permission="conduct.counsel"><ConductStudents /></Guard>)} />
        <Route path="ayin-ogrencisi" element={needsSchool(<Guard permission="conduct.counsel"><MonthStudent /></Guard>)} />
        <Route path="donem-gostergesi" element={needsSchool(<Guard permission="conduct.counsel"><ConductReport /></Guard>)} />
        <Route path="rehberlik" element={needsSchool(<Guard permission="conduct.counsel"><ConductAlerts /></Guard>)} />
        <Route path="isletme-devam" element={needsSchool(<InternshipSheet />)} />
        <Route path="isletmeler" element={needsSchool(<Businesses />)} />
        <Route path="gozlem-kriterleri" element={needsSchool(<Guard permission="conduct.manage"><ConductCriteria /></Guard>)} />
        <Route path="zil-saatleri" element={needsSchool(<Guard permission="schedule.manage"><BellSchedules /></Guard>)} />
        <Route path="ders-programi" element={needsSchool(<Guard permission="schedule.manage"><Timetable /></Guard>)} />
        <Route path="ogretmenler" element={needsSchool(<Guard permission="directory.manage"><Teachers /></Guard>)} />
        {/* Sınıflar artık ders programı sayfasında */}
        <Route path="siniflar" element={<Navigate to="/ders-programi" replace />} />
        <Route path="ekranlar" element={needsSchool(<Guard permission="screens.manage"><Screens /></Guard>)} />
        <Route path="kullanicilar" element={needsSchool(<Guard permission={['users.manage', 'accounts.enroll']}><Users /></Guard>)} />
        <Route path="ayarlar" element={needsSchool(<Guard permission="settings.manage"><Settings /></Guard>)} />
        <Route path="basliklar" element={needsSchool(<Guard permission="labels.manage"><Labels /></Guard>)} />
        <Route path="gecmis" element={needsSchool(<Guard permission="users.manage"><Audit /></Guard>)} />
        <Route path="hesap" element={<Account />} />
        <Route path="platform" element={me.user.isSuperAdmin ? <Platform /> : null} />
        <Route path="tatil-takvimi" element={me.user.isSuperAdmin ? <HolidayCalendar /> : needsSchool(<HolidayCalendar />)} />
        <Route path="platform/takvim" element={<Navigate to="/tatil-takvimi#meb" replace />} />
        <Route path="bildirimler" element={<NotificationsPage />} />
        <Route
          path="*"
          element={<EmptyState icon={<SearchX className="size-6" />} title="Sayfa bulunamadı" action={<Link to="/" className="text-sm font-semibold text-brand-600">Genel bakışa dön</Link>} />}
        />
      </Route>
    </Routes>
  );
}

/**
 * Oturum açıkken davet (ya da e-posta doğrulama) bağlantısı açıldı: bağlantı yeni bir hesap içindir. Çıkış yapılınca
 * aynı adreste davet sayfası açılır (adres korunur).
 */
function SignedInLink({ kind }: { kind: 'invite' | 'verify' }) {
  const { me, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-7 text-center ring-1 ring-slate-200">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">{kind === 'invite' ? 'Davet bağlantısı' : 'E-posta doğrulama bağlantısı'}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Bu tarayıcıda şu an <strong className="text-ink">{me?.user.email}</strong> hesabıyla giriş yapılmış. Bağlantı başka bir hesap içinse önce çıkış yapın;
          {kind === 'invite' ? ' ardından şifre belirleme sayfası açılır.' : ' ardından doğrulama tamamlanır.'}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await logout();
            }}
          >
            Çıkış yap ve bağlantıyı aç
          </Button>
          <Link to="/" className="text-sm font-semibold text-slate-500 hover:text-ink">
            Vazgeç, panele dön
          </Link>
        </div>
      </div>
    </div>
  );
}
