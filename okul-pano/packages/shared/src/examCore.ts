import { sortPeriods, type Period } from './bell.ts';
import { formatClock, parseClock } from './time.ts';

/*
 * Sınav takvimi: sınıf, gün ve ders saatine bağlı yazılı / uygulama / ortak sınavlar. Sınav Sayacı'ndan
 * (tek tarihe geri sayım) ayrıdır. Saat yazılmaz: ders numarası tutulur, saat o sınıfın o günkü zilinden
 * hesaplanır (ikili öğretim, sınıfa özel zil ve günlük müdahaleler kendiliğinden yansır).
 */

export const EXAM_KINDS = { written: 'Yazılı', practical: 'Uygulama', common: 'Ortak' } as const;
export type ExamKind = keyof typeof EXAM_KINDS;
export const EXAM_KIND_KEYS = Object.keys(EXAM_KINDS) as ExamKind[];

/** Bildirim, sınav 1. dersteyse ilk zilden bu kadar dakika önce gider */
export const EXAM_FIRST_LESSON_LEAD_MIN = 15;
export const MAX_EXAM_PERIOD = 16;

/** Sınav saatine göre hatırlatmanın zamanı ve türü */
export interface ExamTiming {
  start: string;
  end: string;
  /** Hatırlatmanın saati (SS:DD) */
  notifyAt: string;
  /** "break": önceki teneffüsün başı, "lunch": öğle arasının başı, "first": ilk zilden önce */
  notifyKind: 'break' | 'lunch' | 'first';
}

/**
 * Sınavın saati ve hatırlatma zamanı: sınavdan önceki aranın başı (teneffüs ya da öğle arası). Sınav günün
 * ilk dersindeyse ara yoktur; hatırlatma ilk zilden `EXAM_FIRST_LESSON_LEAD_MIN` dakika önce gider.
 * O gün bu ders saati yoksa null.
 */
export function examTiming(periods: readonly Period[], periodNo: number, lunchThresholdMin = 30): ExamTiming | null {
  const sorted = sortPeriods(periods);
  const i = sorted.findIndex((p) => p.no === periodNo);
  if (i < 0) return null;
  const p = sorted[i]!;
  if (i === 0) {
    return { start: p.start, end: p.end, notifyAt: formatClock(Math.max(0, parseClock(p.start) - EXAM_FIRST_LESSON_LEAD_MIN * 60)), notifyKind: 'first' };
  }
  const prev = sorted[i - 1]!;
  const gapMin = (parseClock(p.start) - parseClock(prev.end)) / 60;
  return { start: p.start, end: p.end, notifyAt: prev.end, notifyKind: gapMin >= lunchThresholdMin ? 'lunch' : 'break' };
}

/**
 * Bir saat diliminde yerel tarih ve saatin (ör. 2026-11-18 10:10, Europe/Istanbul) gerçek anı. Yaz saati
 * geçişlerinde de doğru sonuç için saat dilimi farkı iki kez hesaplanır.
 */
export function zonedInstant(isoDate: string, clock: string, timeZone: string): Date {
  const [h, m] = clock.split(':').map(Number);
  const guess = Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10)), h ?? 0, m ?? 0);
  const offset = (ms: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(ms))
        .map((x) => [x.type, x.value]),
    );
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    return asUtc - ms;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

/** Panelde, panoda ve mobilde gösterilen sınav kaydı (sunucu saat ve kişileri hesaplamış hâliyle) */
export interface ScheduledExam {
  id: string;
  date: string;
  periodNo: number;
  classGroupId: string;
  className: string;
  subject: string;
  kind: ExamKind;
  note: string | null;
  /** Elle seçilen gözetmen (boşsa ders programından) */
  proctorTeacherId: string | null;
  /** O gün o sınıfın zilinden; tatilde ya da o ders saati yoksa null */
  start: string | null;
  end: string | null;
  /** Hatırlatmanın anı (ISO); hesaplanamıyorsa null */
  notifyAt: string | null;
  notifyKind: ExamTiming['notifyKind'] | null;
  /** O saatte sınıfta olacak öğretmen(ler) */
  proctors: { teacherId: string; fullName: string; onLeave: boolean; manual: boolean }[];
  /** Sınıfa bu dersi veren öğretmen(ler) (ders programından) */
  subjectTeachers: { teacherId: string; fullName: string }[];
  /** Kontrol edilmesi gerekenler (tatil, ders saati yok, gözetmen izinli…) */
  warnings: string[];
}

/** Öğretmenin bir sınavdaki rolleri (bildirim ve "Benim" süzgeci için) */
export function examRoles(exam: Pick<ScheduledExam, 'proctors' | 'subjectTeachers'>, teacherId: string | null | undefined) {
  if (!teacherId) return { proctor: false, subject: false };
  return {
    proctor: exam.proctors.some((p) => p.teacherId === teacherId && !p.onLeave),
    subject: exam.subjectTeachers.some((t) => t.teacherId === teacherId),
  };
}

/** Sınav kaydının bildirim metni: öğretmenin rolüne göre */
export function examReminderText(exam: Pick<ScheduledExam, 'className' | 'subject' | 'kind' | 'periodNo' | 'start' | 'notifyKind'>, roles: { proctor: boolean; subject: boolean }) {
  const kind = EXAM_KINDS[exam.kind].toLocaleLowerCase('tr-TR');
  const when = exam.notifyKind === 'first' ? `Birazdan (${exam.periodNo}. ders${exam.start ? `, ${exam.start}` : ''})` : `Bir sonraki derste (${exam.periodNo}. ders${exam.start ? `, ${exam.start}` : ''})`;
  const role = roles.proctor && roles.subject ? 'Gözetmen sizsiniz; ders de sizin.' : roles.proctor ? 'Gözetmen sizsiniz.' : 'Dersinizin sınavı.';
  return { title: `Sınav: ${exam.className} ${exam.subject}`, body: `${when} ${exam.className} sınıfında ${kind} sınav var. ${role}` };
}
