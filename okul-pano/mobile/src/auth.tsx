import type { Permission, Role } from '@okulpano/shared/permissions';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, login, logout, session } from './api.ts';
import { unregisterPush } from './push.ts';
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
/** Editörü öğretmenden ayıran içerik yetkileri */
const CONTENT_PERMISSIONS: Permission[] = ['announcements.manage', 'highlights.manage', 'ticker.manage', 'exams.manage', 'students.manage', ...MANAGER_PERMISSIONS];

/**
 * Uygulamadaki rol: menüler buna göre kurulur.
 * - platform: platform yöneticisinin kendi görünümü (okullar, abonelikler, MEB takvimi)
 * - owner: okul sahibi (müdür) · admin: yönetici · editor: verilen yetkiler · teacher: öğretmen
 * Platform yöneticisi üyesi olduğu okulda üyeliğindeki rolle (okul sahibi, öğretmen…) çalışır; o görünüme geçebilir.
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
      await Promise.all([session.setSchool(picked), session.setMe(JSON.stringify(data))]);
    },
    [applyMe],
  );

  useEffect(() => {
    session.onSignedOut(() => {
      setMe(null);
      setStatus('signedOut');
    });
    void (async () => {
      const [s, mode] = await Promise.all([session.load(), storage.get(PLATFORM_KEY)]);
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
      if (cached?.user && Array.isArray(cached.schools)) applyMe(cached, s.schoolId);
      try {
        await loadMe(s.schoolId);
      } catch {
        // Bağlantı yoksa saklanan bilgiyle devam edilir; oturum geçersizse (401) api() zaten çıkış yapar
        if (!cached) setStatus('signedOut');
      }
    })();
  }, [loadMe, applyMe]);

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
            : // Duyuru göndermek öğretmenlerde yaygın: öğretmen kaydı olan ve yalnızca duyuru yetkisi olan kişi öğretmen görünümünde kalır
              CONTENT_PERMISSIONS.some((p) => can(p) && (p !== 'announcements.manage' || !school?.teacherId))
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
        await unregisterPush().catch(() => undefined);
        await logout();
        qc.clear();
        setMe(null);
        setStatus('signedOut');
      },
      selectSchool: async (id) => {
        setSchoolId(id);
        await session.setSchool(id);
        qc.clear();
        void api('/api/me/school', { method: 'PUT', body: { schoolId: id } }).catch(() => undefined);
      },
    };
  }, [status, me, schoolId, server, platformMode, loadMe, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Okuldaki üyelik rolü: "Okul sahibi", "Öğretmen"… (platform yöneticisinin okul görünümüne geçişinde) */
export function membershipLabel(s: SchoolAccess): string {
  if (s.role === 'owner') return 'Okul sahibi';
  if (s.role === 'admin') return 'Yönetici';
  return s.teacherId ? 'Öğretmen' : 'Editör';
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
