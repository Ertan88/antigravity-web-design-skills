import { errorText } from '@okulpano/shared';
import { CheckCircle2, XCircle } from './icons.tsx';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** Bildirimdeki eylem (ör. "Geri al"): tıklanınca çalışır, bildirim kapanır */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  kind: 'success' | 'error';
  message: string;
  action?: ToastAction;
}

interface ToastApi {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const close = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (kind: ToastItem['kind'], message: string, action?: ToastAction) => {
      const id = Date.now() + Math.random();
      setItems((list) => [...list.slice(-3), { id, kind, message, action }]);
      // Eylemli bildirim (geri al) okunup tıklanabilsin diye daha uzun kalır
      setTimeout(() => close(id), kind === 'error' || action ? 6000 : 3000);
    },
    [close],
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (m, action) => push('success', m, action), error: (m) => push('error', errorText(m)) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className="animate-toast pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg"
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
            ) : (
              <XCircle className="size-5 shrink-0 text-red-400" />
            )}
            {t.message}
            {t.action && (
              <button
                type="button"
                className="ml-2 shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-brand-300 hover:bg-white/10"
                onClick={() => {
                  close(t.id);
                  t.action!.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('ToastProvider eksik');
  return ctx;
}
