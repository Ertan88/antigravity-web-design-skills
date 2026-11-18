import type { Permission, Role } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshSession, sessionEvents, setAccessToken } from './api.ts';

export interface SchoolAccess {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** Okul türü (ayardan); ad her yerde türüyle yazılır */
  schoolType?: string | null;
  isActive: boolean;
  role: Role;
  permissions: Permission[];
  /** Bağlı öğretmen kaydı */
  teacherId?: string | null;
  /** Öğretmen kadrosundaki ünvan (Müdür Yardımcısı, Uzman Öğretmen…) */
  teacherTitle?: string | null;
  /** Meslek öğretmeni (branşı meslek alanı ya da işletme dersi var) */
  vocational?: boolean;
  /** Üyelik yok, okulun verdiği süreli destek erişimi (platform yöneticisi) */
  support?: boolean;
}

export interface Me {
  user: {
    id: string;
    email: string;
    fullName: string;
    isSuperAdmin: boolean;
    /** İki adımlı doğrulama açık mı; bu hesapta zorunlu mu (platform yöneticisi) */
    mfaEnabled?: boolean;
    mfaRequired?: boolean;
  };
  schools: SchoolAccess[];
  /** En son açılan okul (başka cihazda seçilmiş olabilir) */
  lastSchoolId: string | null;
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  school: SchoolAccess | null;
  schoolId: string;
  setSchoolId: (id: string) => void;
  can: (permission: Permission) => boolean;
  /** Kod gerekiyorsa oturum açılmaz, kod adımı için anahtar döner */
  login: (email: string, password: string) => Promise<{ mfaToken?: string }>;
  loginWithCode: (mfaToken: string, input: { code?: string; recoveryCode?: string; remember: boolean }) => Promise<void>;
  /** Yeni erişim anahtarıyla oturumu sürdürür (ör. iki adımlı doğrulama açıldıktan sonra) */
  adoptAccessToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const SCHOOL_KEY = 'okulpano.admin.school';

function storedSchool(): string {
  try {
    return localStorage.getItem(SCHOOL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolIdState] = useState(storedSchool);
  const queryClient = useQueryClient();

  const reloadMe = useCallback(async () => {
    const data = await api<Me>('/api/me');
    setMe(data);
    setSchoolIdState((current) =>
      data.schools.some((s) => s.id === current) ? current : (data.lastSchoolId ?? data.schools[0]?.id ?? ''),
    );
  }, []);

  useEffect(() => {
    // Sayfa yenilendiğinde çerezdeki oturumla sessizce giriş yap
    refreshSession()
      .then((ok) => (ok ? reloadMe() : undefined))
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, [reloadMe]);

  useEffect(() => {
    const onExpired = () => {
      setAccessToken(null);
      setMe(null);
      queryClient.clear();
    };
    sessionEvents.addEventListener('expired', onExpired);
    return () => sessionEvents.removeEventListener('expired', onExpired);
  }, [queryClient]);

  const setSchoolId = useCallback(
    (id: string) => {
      setSchoolIdState(id);
      try {
        localStorage.setItem(SCHOOL_KEY, id);
      } catch {
        /* yok say */
      }
      queryClient.removeQueries();
      // Başka cihazdan girişte de aynı okul açılsın
      void api('/api/me/school', { method: 'PUT', body: { schoolId: id } }).catch(() => undefined);
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ accessToken?: string; mfaRequired?: boolean; mfaToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.mfaRequired && res.mfaToken) return { mfaToken: res.mfaToken };
      setAccessToken(res.accessToken ?? null);
      await reloadMe();
      return {};
    },
    [reloadMe],
  );

  const loginWithCode = useCallback(
    async (mfaToken: string, input: { code?: string; recoveryCode?: string; remember: boolean }) => {
      const { accessToken } = await api<{ accessToken: string }>('/api/auth/mfa', { method: 'POST', body: { mfaToken, ...input } });
      setAccessToken(accessToken);
      await reloadMe();
    },
    [reloadMe],
  );

  const adoptAccessToken = useCallback(
    async (token: string) => {
      setAccessToken(token);
      queryClient.removeQueries();
      await reloadMe();
    },
    [reloadMe, queryClient],
  );

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setMe(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthState>(() => {
    const school = me?.schools.find((s) => s.id === schoolId) ?? null;
    return {
      me,
      loading,
      school,
      schoolId: school?.id ?? '',
      setSchoolId,
      can: (p) => Boolean(school?.permissions.includes(p)),
      login,
      loginWithCode,
      adoptAccessToken,
      logout,
      reloadMe,
    };
  }, [me, loading, schoolId, setSchoolId, login, loginWithCode, adoptAccessToken, logout, reloadMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider eksik');
  return ctx;
}
