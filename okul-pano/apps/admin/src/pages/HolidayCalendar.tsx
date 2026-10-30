import { CalendarRange } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';
import { HolidaysCard } from './bell/HolidaysCard.tsx';
import { AcademicCalendarCard } from './platform/AcademicCalendarCard.tsx';

/**
 * Tatil Takvimi: MEB çalışma takvimi (ara tatil, yarıyıl, yaz), resmî ve dini tatiller, arifeler, köprü günleri ve
 * okulun kendi tatilleri tek yerde. Okul takvimi görür ve kendi tatillerini ekler; MEB takvimini tarama, onaylama ve
 * düzeltme yalnızca platform yöneticisindedir (bütün okullar için ortak).
 */
export function HolidayCalendar() {
  const { me, school } = useAuth();
  const platform = Boolean(me?.user.isSuperAdmin);
  // Bildirimden gelince (#meb) takvim yönetimine kaydır; içerik geç yüklendiği için kısa gecikmeyle
  const { hash } = useLocation();
  useEffect(() => {
    if (hash !== '#meb') return;
    const t = setTimeout(() => document.getElementById('meb')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600);
    return () => clearTimeout(t);
  }, [hash]);
  return (
    <>
      <PageHeader
        title="Tatil Takvimi"
        description="Panoda zilin çalmadığı günler, yarım günler ve eğitim yılının takvimi. Ara tatil, yarıyıl ve yaz tatili her yıl MEB çalışma takviminden otomatik gelir; resmî ve dini bayramlar kendiliğinden hesaplanır."
      />
      <div className="space-y-6">
        {school && <HolidaysCard />}
        {platform && (
          <section id="meb" className="scroll-mt-20 space-y-2">
            <h2 className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-500 uppercase">
              <CalendarRange className="size-4" /> Platform yönetimi · bütün okullar için ortak
            </h2>
            <AcademicCalendarCard />
          </section>
        )}
      </div>
    </>
  );
}
