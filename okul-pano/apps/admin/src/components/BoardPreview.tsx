import { useQuery } from '@tanstack/react-query';
import { Clock, ExternalLink, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { useState } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { Input } from './ui.tsx';

const DISPLAY_URL = (import.meta.env.VITE_DISPLAY_URL as string | undefined) ?? '/display/';

/**
 * Panonun canlı önizlemesi: gerçek pano uygulaması kısa ömürlü bir önizleme anahtarıyla
 * iframe içinde çalışır. "Zaman makinesi" ile panonun herhangi bir anda nasıl görüneceği denenebilir.
 */
export function BoardPreview({ screenId, compact = false, portrait = false }: { screenId?: string | null; compact?: boolean; portrait?: boolean } = {}) {
  const { schoolId } = useAuth();
  const [at, setAt] = useState('');
  const token = useQuery({
    queryKey: [schoolId, 'preview-token'],
    queryFn: () => api<{ token: string }>(`/api/schools/${schoolId}/preview-token`, { method: 'POST' }),
    refetchInterval: 25 * 60 * 1000,
    staleTime: 20 * 60 * 1000,
  });

  const atIso = at ? new Date(at).toISOString() : '';
  const src = token.data
    ? `${DISPLAY_URL}?preview=${encodeURIComponent(token.data.token)}${screenId ? `&screen=${screenId}` : ''}${atIso ? `&at=${encodeURIComponent(atIso)}` : ''}`
    : null;

  return (
    <div>
      <div
        className={clsx(
          'relative overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-200',
          portrait ? 'mx-auto aspect-[9/16] h-[56vh] max-w-full' : 'aspect-video w-full',
        )}
      >
        {src ? (
          <iframe key={src} src={src} title="Pano önizlemesi" className="absolute inset-0 size-full border-0" allow="autoplay" />
        ) : (
          <div className="absolute inset-0 animate-pulse bg-slate-800" />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!compact && (
          <>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Clock className="size-4" />
              <span>Zaman makinesi</span>
            </div>
            <div className="w-56">
              <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-9" aria-label="Önizleme zamanı" />
            </div>
            {at && (
              <button type="button" onClick={() => setAt('')} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-ink">
                <RotateCcw className="size-3.5" /> Şimdiye dön
              </button>
            )}
          </>
        )}
        {src && (
          <a href={src} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
            Tam ekran aç <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
