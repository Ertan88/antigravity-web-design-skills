import type { Permission, Role } from '@okulpano/shared/permissions';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, login, logout, session } from './api.ts';
import { unregisterPush } from './push.ts';

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
}

export interface Me {
  user: { id: string; email: string; fullName: string; isSuperAdmin: boolean };
  schools: SchoolAccess[];
}

/** Yönetici ekranlarını (kontrol merkezi, onaylar, pano kumandası) açan yetkiler */
const MANAGER_PERMISSIONS: Permission[] = ['announcements.approve', 'board.control', 'screens.manage', 'emergency.manage', 'duties.manage', 'leaves.manage'];

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
  signIn: (server: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectSchool: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthValue['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [server, setServer] = useState('');

  const loadMe = useCallback(async (preferred: string | null) => {
    const data = await api<Me>('/api/me');
    setMe(data);
    const pick = data.schools.find((s) => s.id === preferred) ?? data.schools[0] ?? null;
    setSchoolId(pick?.id ?? null);
    await session.setSchool(pick?.id ?? null);
    setStatus('signedIn');
  }, []);

  useEffect(() => {
    session.onSignedOut(() => {
      setMe(null);
      setStatus('signedOut');
    });
    void (async () => {
      const s = await session.load();
      setServer(s.server);
      if (!s.hasSession || !s.server) return setStatus('signedOut');
      try {
        await loadMe(s.schoolId);
      } catch {
        setStatus('signedOut');
      }
    })();
  }, [loadMe]);

  const value = useMemo<AuthValue>(() => {
    const school = me?.schools.find((s) => s.id === schoolId) ?? null;
    const can = (p: Permission) => Boolean(school?.permissions.includes(p));
    return {
      status,
      me,
      school,
      server,
      can,
      isManager: MANAGER_PERMISSIONS.some(can),
      isTeacher: Boolean(school?.teacherId),
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
      },
    };
  }, [status, me, schoolId, server, loadMe, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
