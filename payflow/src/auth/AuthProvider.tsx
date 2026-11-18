import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isFirebaseConfigured } from '../config/env';
import { AuthService, AuthUser } from './types';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'guest';

interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Firebase yapılandırıldı mı (değilse yalnızca hesapsız kullanım). */
  available: boolean;
  service: AuthService | null;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
}

const GUEST_KEY = 'payflow.guest';
const Ctx = createContext<AuthValue | null>(null);

function defaultService(): AuthService | null {
  if (!isFirebaseConfigured()) return null;
  // Firebase yalnızca yapılandırıldığında yüklenir (testler ve yapılandırmasız kurulum için).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createFirebaseService } = require('./firebaseService') as typeof import('./firebaseService');
  return createFirebaseService();
}

export function AuthProvider({ children, service: injected }: { children: ReactNode; service?: AuthService | null }) {
  const service = useMemo(() => (injected !== undefined ? injected : defaultService()), [injected]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authResolved, setAuthResolved] = useState(!service);
  const [guest, setGuest] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(GUEST_KEY)
      .then((v) => setGuest(v === '1'))
      .catch(() => setGuest(false));
  }, []);

  useEffect(() => {
    if (!service) return;
    return service.onAuthChange((u) => {
      setUser(u);
      setAuthResolved(true);
    });
  }, [service]);

  const continueAsGuest = useCallback(() => {
    setGuest(true);
    AsyncStorage.setItem(GUEST_KEY, '1').catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    setGuest(false);
    AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    if (service && user) await service.signOut();
  }, [service, user]);

  const status: AuthStatus = !authResolved || guest === null ? 'loading' : user ? 'signedIn' : guest ? 'guest' : 'signedOut';

  return (
    <Ctx.Provider value={{ status, user, available: !!service, service, continueAsGuest, signOut }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return v;
}
