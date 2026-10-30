import clsx from 'clsx';
import { CalendarCheck2, CalendarRange } from 'lucide-react';
import { MonthNav, monthLabel } from './calendar.tsx';

export interface MonthResolution {
  month: string;
  titleMonth: string | null;
  datesMonth: string | null;
  conflict: boolean;
  source: 'chosen' | 'title' | 'dates' | 'current';
}

const SOURCE: Record<MonthResolution['source'], string> = {
  title: 'dosyanın başlığındaki "Ait olduğu ay"dan',
  dates: 'dosyadaki tarihlerden',
  current: 'dosyada ay bulunamadı; bu ay',
  chosen: 'sizin seçiminiz',
};

/**
 * İçe aktarılan çizelgenin hangi aya kaydedileceği. Başlıktaki ay ile tarihler çelişirse
 * (ör. başlık güncellenmiş ama tarihler geçen aydan kalmış) iki seçenek de gösterilir.
 * Başka aya ait tarihler seçilen ayın aynı hafta gününe taşınır.
 */
export function MonthChoice({
  resolution,
  onChoose,
  movedCount,
}: {
  resolution: MonthResolution;
  onChoose: (month: string) => void;
  /** Seçilen aya taşınan tarih sayısı */
  movedCount: number;
}) {
  const r = resolution;
  const options = [
    r.titleMonth && { value: r.titleMonth, label: monthLabel(r.titleMonth), hint: 'Başlıkta yazan ay' },
    r.datesMonth && r.datesMonth !== r.titleMonth && { value: r.datesMonth, label: monthLabel(r.datesMonth), hint: 'Tarihlerin ait olduğu ay' },
  ].filter(Boolean) as { value: string; label: string; hint: string }[];

  return (
    <div className={clsx('rounded-2xl p-4 ring-1', r.conflict ? 'bg-amber-50 ring-amber-200' : 'bg-brand-50 ring-brand-100')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl', r.conflict ? 'bg-amber-500 text-white' : 'bg-brand-600 text-white')}>
            {r.conflict ? <CalendarRange className="size-4" /> : <CalendarCheck2 className="size-4" />}
          </span>
          <div className="text-sm">
            <div className="font-semibold text-ink">
              Bu çizelge <span className="underline decoration-2 underline-offset-2">{monthLabel(r.month)}</span> ayına kaydedilecek
            </div>
            <div className="text-xs text-slate-600">
              {r.conflict
                ? `Başlıkta ${monthLabel(r.titleMonth!)} yazıyor ama tarihler ${monthLabel(r.datesMonth!)} ayına ait. Doğru ayı seçin.`
                : `Ay ${SOURCE[r.source]} alındı.`}
              {movedCount > 0 && ` ${movedCount} tarih ${monthLabel(r.month)} ayının aynı hafta gününe taşındı.`}
            </div>
          </div>
        </div>
        <MonthNav month={r.month} onMonth={onChoose} />
      </div>
      {r.conflict && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChoose(o.value)}
              className={clsx(
                'rounded-xl px-3.5 py-2.5 text-left ring-1 transition',
                r.month === o.value ? 'bg-surface ring-2 ring-amber-500' : 'bg-surface/60 ring-amber-200 hover:bg-surface',
              )}
            >
              <div className="text-sm font-semibold text-ink">{o.label}</div>
              <div className="text-xs text-slate-500">{o.hint}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
