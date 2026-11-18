import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, Dispatch, ReactNode, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { AppState } from '../core/model';
import { Action, initialState, reducer } from './reducer';

/**
 * Uygulama verisi: tek bir durum ağacı, cihazda AsyncStorage'da JSON olarak saklanır.
 * Adım 6'da Firebase ile buluta yedeklenecek; bu katman aynı kalır.
 */
export const STORAGE_KEY = 'payflow.state.v1';

interface StoreValue {
  state: AppState;
  dispatch: Dispatch<Action>;
  ready: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const [state, dispatch] = useReducer(reducer, initial ?? initialState);
  const [ready, setReady] = useState(!!initial);
  const hydrated = useRef(!!initial);

  useEffect(() => {
    if (hydrated.current) return;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) dispatch({ type: 'hydrate', state: JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => {
        hydrated.current = true;
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state]);

  return <StoreContext.Provider value={{ state, dispatch, ready }}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore, StoreProvider içinde kullanılmalı');
  return v;
}
