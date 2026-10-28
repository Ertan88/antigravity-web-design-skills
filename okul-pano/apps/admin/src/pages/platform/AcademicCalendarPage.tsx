import { PageHeader } from '../../components/ui.tsx';
import { AcademicCalendarCard } from './AcademicCalendarCard.tsx';

/** Platform › MEB Çalışma Takvimi: bütün okullar için ortak eğitim yılı takvimi */
export function AcademicCalendarPage() {
  return (
    <>
      <PageHeader
        title="MEB Çalışma Takvimi"
        description="Ara tatil, yarıyıl ve yaz tatili bütün okullara bu takvimden işlenir. Takvim her yıl haziran ortasından itibaren MEB'in sitesinden otomatik alınır; buradan tarayabilir, onaylayabilir ya da düzeltebilirsiniz."
      />
      <AcademicCalendarCard />
    </>
  );
}
