import { CircleAlert } from 'lucide-react';
import { Button } from './ui.tsx';

/**
 * Kaydedilmemiş değişiklik varken formun altında ekrana yapışık duran Kaydet / İptal çubuğu;
 * uzun sayfalarda kaydetmek için en alta inmek gerekmez.
 */
export function SaveBar({
  show,
  saving,
  onSave,
  onCancel,
  message = 'Kaydedilmemiş değişiklikler var',
}: {
  show: boolean;
  saving?: boolean;
  onSave: () => void;
  onCancel: () => void;
  message?: string;
}) {
  if (!show) return null;
  return (
    <div className="animate-toast sticky bottom-4 z-30 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-200">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <CircleAlert className="size-4 text-amber-500" />
        {message}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          İptal
        </Button>
        <Button loading={saving} onClick={onSave}>
          Kaydet
        </Button>
      </div>
    </div>
  );
}
