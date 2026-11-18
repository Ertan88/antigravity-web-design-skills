import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { AppState } from '../core/model';
import { useStore } from '../store/StoreProvider';
import { useAuth } from './AuthProvider';

/**
 * Bulut yedek senkronu (oturum açıkken):
 *  1) Girişte buluttaki yedeği okur. Cihaz boşsa yedeği yükler; ikisi de doluysa
 *     ve bulut daha yeniyse kullanıcıya hangisini kullanacağını sorar.
 *  2) Sonra her değişikliği 3 sn gecikmeyle buluta yazar.
 */
export type SyncStatus = 'off' | 'checking' | 'synced' | 'saving' | 'error';

const SyncCtx = createContext<{ status: SyncStatus; lastSyncedAt: number | null }>({ status: 'off', lastSyncedAt: null });
const lastSyncKey = (uid: string) => `payflow.lastSync.${uid}`;
const hasData = (s: AppState) => s.cards.length + s.bills.length + s.expenses.length + s.cardPayments.length > 0;

export function CloudSync({ children, debounceMs = 3000 }: { children: ReactNode; debounceMs?: number }) {
  const { status: authStatus, user, service } = useAuth();
  const { state, dispatch, ready } = useStore();
  const [status, setStatus] = useState<SyncStatus>('off');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const skipNextUpload = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const uid = authStatus === 'signedIn' ? user?.uid : undefined;

  // 1) Giriş anında uzlaştırma
  useEffect(() => {
    setInitialized(false);
    if (!uid || !service || !ready) {
      setStatus('off');
      return;
    }
    let cancelled = false;
    setStatus('checking');
    (async () => {
      try {
        const [remote, lastRaw] = await Promise.all([service.loadBackup(uid), AsyncStorage.getItem(lastSyncKey(uid))]);
        if (cancelled) return;
        const local = stateRef.current;
        const last = lastRaw ? Number(lastRaw) : 0;
        const useRemote = () => {
          skipNextUpload.current = true;
          dispatch({ type: 'hydrate', state: remote!.state });
          setLastSyncedAt(remote!.updatedAt);
          AsyncStorage.setItem(lastSyncKey(uid), String(remote!.updatedAt)).catch(() => {});
        };
        if (remote && hasData(remote.state)) {
          if (!hasData(local)) useRemote();
          else if (remote.updatedAt > last) {
            const choice = await new Promise<'cloud' | 'device'>((resolve) =>
              Alert.alert('Buluttaki yedek bulundu', 'Bu hesapta başka bir cihazdan kaydedilmiş veriler var. Hangisini kullanalım?', [
                { text: 'Bu cihazdakini', onPress: () => resolve('device') },
                { text: 'Buluttakini', onPress: () => resolve('cloud') },
              ]),
            );
            if (cancelled) return;
            if (choice === 'cloud') useRemote();
          } else setLastSyncedAt(remote.updatedAt);
        }
        setStatus('synced');
      } catch {
        if (!cancelled) setStatus('error');
      } finally {
        if (!cancelled) setInitialized(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, service, ready, dispatch]);

  // 2) Değişiklikleri buluta yaz
  useEffect(() => {
    if (!uid || !service || !initialized) return;
    if (skipNextUpload.current) {
      skipNextUpload.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setStatus('saving');
      try {
        const at = await service.saveBackup(uid, state);
        setLastSyncedAt(at);
        AsyncStorage.setItem(lastSyncKey(uid), String(at)).catch(() => {});
        setStatus('synced');
      } catch {
        setStatus('error');
      }
    }, debounceMs);
    return () => clearTimeout(t);
  }, [state, uid, service, initialized, debounceMs]);

  return <SyncCtx.Provider value={{ status, lastSyncedAt }}>{children}</SyncCtx.Provider>;
}

export const useCloudSync = () => useContext(SyncCtx);
