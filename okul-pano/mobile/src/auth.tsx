import { appView, type Permission, type Role } from '@okulpano/shared/permissions';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadAccounts, saveAccounts, upsert, type SavedAccount } from './accounts.ts';
import { api, login, loginOther, logout, session } from './api.ts';
import { clearSaved, restoreQueries, startSaving } from './persist.ts';
import { registerForPush, unregisterPush } from './push.ts';
import { storage } from './storage.ts';

export interface SchoolAccess {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
  role: Role;
  permissions: Permission[];
  /** Bağlı öğretmen kaydı: kendi nöbetleri ve ders programı */
  teacherId: string | null;
  /** Genel Ayarlar › Okul türü */
  schoolType?: string | null;
  /** Öğretmen kadrosundaki ünvan (Müdür Yardımcısı, Uzman Öğretmen…) */
  teacherTitle?: string | null;
  /** Meslek öğretmeni (branşı meslek alanı ya da işletme dersi var) */
  vocational?: boolean;
  /** Üyelik yok, okulun (müdürün) verdiği süreli destek erişimi (platform yöneticisi) */
  support?: boolean;
}

export interface Me {
  user: { id: string; email: string; fullName: string; isSuperAdmin: boolean };
  schools: SchoolAccess[];
  /** En son açılan okul (panelde ya da başka cihazda seçilmiş olabilir) */
  lastSchoolId?: string | null;
}

/** Yönetici ekranlarını (kontrol merkezi, onaylar, pano kumandası) açan yetkiler */
const MANAGER_PERMISSIONS: Permission[] = ['announcements.approve', 'board.control', 'screens.manage', 'emergency.manage', 'duties.manage', 'leaves.manage'];

/**
 * Uygulamadaki rol: menüler buna göre kurulur.
 * - platform: platform yöneticisinin kendi görünümü (okullar, abonelikler, MEB takvimi)
 * - owner: okul müdürü · admin: yönetici · editor: verilen yetkiler · teacher: öğretmen
 * Platform yöneticisi üyesi olduğu okulda üyeliğindeki rolle (okul müdürü, öğretmen…) çalışır; o görünüme geçebilir.
 */
export type AppRole = 'platform' | 'owner' | 'admin' | 'editor' | 'teacher';

interface AuthValue {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  school: SchoolAccess | null;
  server: string;
  can: (p: Permission) => boolean;
  /** Yönetici ana ekranı (Kontrol merkezi) */
  isManager: boolean;
  /** Öğretmen kaydına bağlı (Bugün, Nöbetlerim) */
  isTeacher: boolean;
  role: AppRole;
  /** Platform yöneticisi: platform görünümü ile okul görünümü arasında geçiş */
  setPlatformMode: (on: boolean) => Promise<void>;
  reloadMe: () => Promise<void>;
  signIn: (server: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectSchool: (id: string) => Promise<void>;
  /** Bu telefonda kayıtlı hesaplar (etkin olan dahil) */
  accounts: SavedAccount[];
  /** Kayıtlı başka bir hesaba şifresiz geçer */
  switchAccount: (userId: string) => Promise<void>;
  /** Etkin hesabı saklayıp giriş ekranını açar (yeni hesap eklemek için) */
  addAccount: () => Promise<void>;
  /** Etkin oturuma dokunmadan bir hesabı listeye ekler (hesap ayırma sonrası) */
  rememberAccount: (email: string, password: string) => Promise<void>;
  /** Kayıtlı (etkin olmayan) hesabı bu telefondan kaldırır */
  forgetAccount: (userId: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const PLATFORM_KEY = 'okulpano.platformMode';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthValue['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [server, setServer] = useState('');
  // Platform yöneticisi açılışta platform görünümündedir; okuluna geçince hatırlanır
  const [platformMode, setPlatformModeState] = useState(true);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const updateAccounts = useCallback(async (fn: (list: SavedAccount[]) => SavedAccount[]) => {
    const next = fn(await loadAccounts());
    await saveAccounts(next);
    setAccounts(next);
    return next;
  }, []);

  const applyMe = useCallback((data: Me, preferred: string | null) => {
    setMe(data);
    const pick =
      data.schools.find((s) => s.id === preferred) ?? data.schools.find((s) => s.id === data.lastSchoolId) ?? data.schools[0] ?? null;
    setSchoolId(pick?.id ?? null);
    setStatus('signedIn');
    return pick?.id ?? null;
  }, []);

  const loadMe = useCallback(
    async (preferred: string | null) => {
      const data = await api<Me>('/api/me');
      const picked = applyMe(data, preferred);
      startSaving(qc, `${session.server}|${data.user.id}`);
      await Promise.all([session.setSchool(picked), session.setMe(JSON.stringify(data))]);
      // Etkin hesap listede (yenileme anahtarı oturumda durur, listede tutulmaz)
      await updateAccounts((list) => upsert(list, { ...accountMeta(data), server: session.server, refresh: null }));
    },
    [applyMe, qc, updateAccounts],
  );

  useEffect(() => {
    session.onSignedOut(() => {
      void clearSaved();
      setMe(null);
      setStatus('signedOut');
    });
    void (async () => {
      const [s, mode, saved] = await Promise.all([session.load(), storage.get(PLATFORM_KEY), loadAccounts()]);
      setAccounts(saved);
      setServer(s.server);
      setPlatformModeState(mode !== 'school');
      if (!s.hasSession || !s.server) return setStatus('signedOut');
      // Son bilinen kullanıcı bilgisiyle ekran hemen açılır; güncel bilgi arkada gelir (yetki değiştiyse ekran yenilenir)
      let cached: Me | null = null;
      try {
        cached = s.me ? (JSON.parse(s.me) as Me) : null;
      } catch {
        cached = null;
      }
      if (cached?.user && Array.isArray(cached.schools)) {
        // Son görülen ekran verileri de yüklenir: ekranlar sunucuyu (uykudan uyanıyor olabilir) beklemeden açılır
        await restoreQueries(qc, `${s.server}|${cached.user.id}`);
        applyMe(cached, s.schoolId);
      }
      try {
        await loadMe(s.schoolId);
      } catch {
        // Bağlantı yoksa saklanan bilgiyle devam edilir; oturum geçersizse (401) api() zaten çıkış yapar
        if (!cached) setStatus('signedOut');
      }
    })();
  }, [loadMe, applyMe, qc]);

  const value = useMemo<AuthValue>(() => {
    const school = me?.schools.find((s) => s.id === schoolId) ?? null;
    const can = (p: Permission) => Boolean(school?.permissions.includes(p));
    const role: AppRole =
      me?.user.isSuperAdmin && (platformMode || !school)
        ? 'platform'
        : school?.role === 'owner'
          ? 'owner'
          : school?.role === 'admin'
            ? 'admin'
            : // Öğretmen kaydı olan herkes görevi olsa da öğretmen görünümünde kalır (görevi alt menüde ve Menü'de);
              // editör görünümü yalnızca kadroda olmayan görevliler içindir (ör. memur). Kural panelle ortak.
              school && appView(school) === 'editor'
              ? 'editor'
              : 'teacher';
    return {
      status,
      me,
      school,
      server,
      can,
      isManager: MANAGER_PERMISSIONS.some(can),
      isTeacher: Boolean(school?.teacherId),
      role,
      setPlatformMode: async (on) => {
        setPlatformModeState(on);
        await storage.set(PLATFORM_KEY, on ? 'platform' : 'school');
        qc.clear();
      },
      reloadMe: async () => loadMe(schoolId),
      signIn: async (url, email, password) => {
        await session.setServer(url);
        setServer(session.server);
        await login(email.trim().toLowerCase(), password);
        await loadMe(null);
      },
      signOut: async () => {
        const id = me?.user.id;
        await unregisterPush().catch(() => undefined);
        await clearSaved();
        await logout();
        if (id) await updateAccounts((list) => list.filter((a) => !(a.userId === id && a.server === session.server)));
        qc.clear();
        setMe(null);
        setStatus('signedOut');
      },
      accounts,
      switchAccount: async (userId) => {
        const target = accounts.find((a) => a.userId === userId);
        if (!target || target.userId === me?.user.id) return;
        if (!target.refresh) throw new Error('Bu hesabın oturumu kapanmış. Şifreyle yeniden giriş yapın.');
        const current = me ? { ...accountMeta(me), server: session.server, refresh: session.refresh } : null;
        // Bildirimler yeni hesaba gelsin: telefon eski hesaptan çıkarılır, yeni hesapla kaydedilir
        await unregisterPush().catch(() => undefined);
        await clearSaved();
        await updateAccounts((list) => {
          let next = current ? upsert(list, current) : list;
          next = upsert(next, { ...target, refresh: null });
          return next;
        });
        qc.clear();
        await session.setServer(target.server);
        setServer(session.server);
        await session.setTokens(null, target.refresh);
        try {
          await loadMe(null);
        } catch (e) {
          // Oturum düşmüşse önceki hesaba dönülür
          await updateAccounts((list) => upsert(list, { ...target, refresh: null }));
          if (current?.refresh) {
            await session.setServer(current.server);
            await session.setTokens(null, current.refresh);
            await loadMe(null).catch(() => undefined);
          }
          throw e instanceof Error ? e : new Error('Hesaba geçilemedi');
        }
        void registerForPush({ auto: true }).catch(() => undefined);
      },
      addAccount: async () => {
        if (me) await updateAccounts((list) => upsert(list, { ...accountMeta(me), server: session.server, refresh: session.refresh }));
        await unregisterPush().catch(() => undefined);
        await clearSaved();
        // Sunucudaki oturum kapatılmaz: hesap listede kalır, geri geçilebilir
        await session.setTokens(null, null);
        qc.clear();
        setMe(null);
        setStatus('signedOut');
      },
      rememberAccount: async (email, password) => {
        const r = await loginOther(email, password);
        const meta = { userId: r.me.id, email: r.me.email, fullName: r.me.fullName, kind: r.me.isSuperAdmin ? ('platform' as const) : ('school' as const), detail: r.me.isSuperAdmin ? 'Platform yöneticisi' : '' };
        await updateAccounts((list) => upsert(list, { ...meta, server: session.server, refresh: r.refreshToken }));
      },
      forgetAccount: async (userId) => {
        const a = accounts.find((x) => x.userId === userId);
        if (!a || a.userId === me?.user.id) return;
        if (a.refresh) void fetch(`${a.server}/api/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: a.refresh }) }).catch(() => undefined);
        await updateAccounts((list) => list.filter((x) => !(x.userId === userId && x.server === a.server)));
      },
      selectSchool: async (id) => {
        setSchoolId(id);
        await session.setSchool(id);
        qc.clear();
        void api('/api/me/school', { method: 'PUT', body: { schoolId: id } }).catch(() => undefined);
      },
    };
  }, [status, me, schoolId, server, platformMode, loadMe, qc, accounts, updateAccounts]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Kişinin okuldaki adı: öğretmen kaydı bağlıysa kadrodaki ünvanı (Müdür Yardımcısı, Uzman Öğretmen…),
 * değilse rolü ("Okul müdürü", "Yönetici", "Öğretmen", "Editör")
 */
export function membershipLabel(s: SchoolAccess): string {
  if (s.teacherTitle) return s.teacherTitle;
  if (s.role === 'owner') return 'Okul müdürü';
  if (s.role === 'admin') return 'Yönetici';
  // Kadroda olmayan kişi (ör. memur) panelde olduğu gibi "Görevli"
  return s.teacherId ? 'Öğretmen' : 'Görevli';
}

/** Hesap listesinde görünen bilgiler: platform hesabı ya da okul (ilk okul ve görevi) */
function accountMeta(data: Me): Omit<SavedAccount, 'server' | 'refresh'> {
  const own = data.schools.filter((s) => !s.support);
  return {
    userId: data.user.id,
    email: data.user.email,
    fullName: data.user.fullName,
    kind: data.user.isSuperAdmin ? 'platform' : 'school',
    detail: data.user.isSuperAdmin ? 'Platform yöneticisi' : own.map((s) => `${s.name} · ${membershipLabel(s)}`).join(', '),
  };
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('AuthProvider eksik');
  return v;
}

/** Seçili okulun API yolu: /api/schools/:id/<resource> */
export function useSchoolPath(resource = ''): string {
  const { school } = useAuth();
  return `/api/schools/${school?.id ?? '_'}${resource ? `/${resource}` : ''}`;
}
