import clsx from 'clsx';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { uploadImage } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';

const MAX_BYTES = 10 * 1024 * 1024;

export function ImageUpload({
  value,
  onChange,
  invalid,
  hint = 'PNG, JPG veya WEBP · en fazla 10 MB · en iyi sonuç için 16:9 (1920×1080)',
  aspect = 'aspect-video',
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  invalid?: boolean;
  hint?: string;
  aspect?: string;
}) {
  const { schoolId } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) return setError('Lütfen bir görsel dosyası seçin.');
    if (file.size > MAX_BYTES) return setError('Dosya 10 MB sınırını aşıyor.');
    setBusy(true);
    try {
      onChange(await uploadImage(schoolId, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yükleme başarısız.');
    } finally {
      setBusy(false);
    }
  };

  if (value) {
    return (
      <div className={clsx('group relative overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-200', aspect)}>
        <img src={value} alt="Yüklenen görsel" className="size-full object-contain" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-lg bg-slate-900/70 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-slate-900"
        >
          <X className="size-3.5" /> Kaldır
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handle(e.dataTransfer.files[0]);
        }}
        className={clsx(
          'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-colors',
          aspect,
          drag ? 'border-brand-500 bg-brand-50' : invalid ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40',
        )}
      >
        {busy ? <Loader2 className="size-7 animate-spin text-brand-600" /> : <ImagePlus className="size-7 text-slate-400" />}
        <span className="text-sm font-semibold text-slate-700">{busy ? 'Yükleniyor…' : 'Görsel seçin ya da buraya sürükleyin'}</span>
        <span className="text-xs text-slate-500">{hint}</span>
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void handle(e.target.files?.[0])} />
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
