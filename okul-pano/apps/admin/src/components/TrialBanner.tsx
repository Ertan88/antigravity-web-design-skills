import { trialStatus } from '@okulpano/shared';
import clsx from 'clsx';
import { Clock } from 'lucide-react';
import { useSchool } from '../lib/data.ts';

/**
 * Deneme paketindeki okul için kalan süre: son 7 günde ve bittiğinde öne çıkar. Süre dolunca panel salt okunurdur;
 * görüntüleme ve dışa aktarma sürer.
 */
export function TrialBanner() {
  const school = useSchool();
  const status = school.data ? trialStatus(school.data) : null;
  if (!status) return null;
  const urgent = status.expired || status.daysLeft <= 7;
  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(new Date(status.endsAt));
  return (
    <div
      role="status"
      className={clsx(
        'flex items-center justify-center gap-2 px-4 py-2 text-center text-sm',
        status.expired ? 'bg-red-600 text-white' : urgent ? 'bg-amber-100 text-amber-900' : 'bg-brand-50 text-brand-900',
      )}
    >
      <Clock className="size-4 shrink-0" />
      {status.expired ? (
        <span>
          <strong>Deneme süreniz doldu.</strong> Panel salt okunur, panolarda içerik gösterilmiyor. Aboneliği başlatmak için bizimle iletişime geçin.
        </span>
      ) : (
        <span>
          Ücretsiz deneme: <strong>{status.daysLeft === 0 ? 'bugün bitiyor' : `${status.daysLeft} gün kaldı`}</strong> ({date}).
          {urgent && ' Kesintisiz devam etmek için aboneliği başlatın.'}
        </span>
      )}
    </div>
  );
}
