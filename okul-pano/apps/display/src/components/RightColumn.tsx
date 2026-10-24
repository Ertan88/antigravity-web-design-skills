import { formatDuration, periodLabel, type BellStatus, type DisplayState } from '@okulpano/shared/client';
import { useEffect, useState, type CSSProperties } from 'react';
import { AutoPager } from './AutoPager.tsx';
import { BellIcon, BookIcon, CoffeeIcon, UtensilsIcon } from './Icons.tsx';

function describe(status: BellStatus) {
  switch (status.kind) {
    case 'lesson':
      return {
        title: periodLabel(status.period),
        caption: 'Dersin bitmesine',
        range: `${status.period.start} – ${status.period.end}`,
        next: status.next ? `Sıradaki: ${periodLabel(status.next)} · ${status.next.start}` : 'Son ders',
        remaining: status.remainingSec,
        progress: 1 - status.remainingSec / status.totalSec,
        tone: 'lesson',
      };
    case 'break':
      return {
        title: status.isLunch ? 'Öğle Arası' : 'Teneffüs',
        caption: `${periodLabel(status.next)} başlamasına`,
        range: `${status.prev.end} – ${status.next.start}`,
        next: `Sıradaki: ${periodLabel(status.next)} · ${status.next.start}`,
        remaining: status.remainingSec,
        progress: 1 - status.remainingSec / status.totalSec,
        tone: status.isLunch ? 'lunch' : 'break',
      };
    case 'before':
      return {
        title: 'Günaydın!',
        caption: 'Derslerin başlamasına',
        range: `İlk ders ${status.next.start}`,
        next: `${periodLabel(status.next)} · ${status.next.start} – ${status.next.end}`,
        remaining: status.remainingSec,
        progress: null,
        tone: 'idle',
      };
    case 'after':
      return {
        title: 'Dersler sona erdi',
        caption: 'İyi akşamlar',
        range: `Son ders ${status.last.end}'de bitti`,
        next: null,
        remaining: null,
        progress: null,
        tone: 'idle',
      };
    default:
      return { title: 'Bugün ders yok', caption: 'İyi tatiller', range: null, next: null, remaining: null, progress: null, tone: 'idle' };
  }
}

export function BellCard({ status }: { status: BellStatus }) {
  const d = describe(status);
  const urgent = d.remaining != null && d.remaining <= 60 && (status.kind === 'lesson' || status.kind === 'break');
  const Glyph = d.tone === 'lunch' ? UtensilsIcon : d.tone === 'break' ? CoffeeIcon : BellIcon;

  return (
    <section className={`card bell-card tone-${d.tone} ${urgent ? 'urgent' : ''}`}>
      <div className="card-label">
        <Glyph size={22} /> Zil Vakti
      </div>
      <div className="bell-title">{d.title}</div>
      {d.remaining != null ? (
        <>
          <div className="bell-caption">{d.caption}</div>
          <div className="bell-countdown">{formatDuration(d.remaining)}</div>
        </>
      ) : (
        <div className="bell-caption bell-caption-lg">{d.caption}</div>
      )}
      {d.progress != null && (
        <div className="bell-progress" role="progressbar" aria-valuenow={Math.round(d.progress * 100)}>
          <div style={{ width: `${Math.min(100, d.progress * 100)}%` }} />
        </div>
      )}
      {d.range && <div className="bell-range">{d.range}</div>}
      {d.next && <div className="bell-next">{d.next}</div>}
    </section>
  );
}

/** Kademe renkleri: aynı sınıf düzeyindeki tüm şubeler aynı renkte (9-A, 9-B… hepsi mavi) */
const GRADE_HUES: Record<number, string> = {
  1: '#06b6d4',
  2: '#a855f7',
  3: '#ec4899',
  4: '#f97316',
  5: '#14b8a6',
  6: '#22c55e',
  7: '#84cc16',
  8: '#eab308',
  9: '#0ea5e9',
  10: '#8b5cf6',
  11: '#f43f5e',
  12: '#f59e0b',
};
const FALLBACK_HUES = ['#0ea5e9', '#8b5cf6', '#f43f5e', '#f59e0b', '#10b981', '#ec4899'];

export function gradeHue(className: string): string {
  const name = className.trim().toLocaleLowerCase('tr-TR');
  const grade = /^(\d{1,2})/.exec(name)?.[1];
  if (grade && GRADE_HUES[Number(grade)]) return GRADE_HUES[Number(grade)]!;
  if (/^(haz|hz)/.test(name)) return '#64748b';
  // Sayısız adlar (ör. "Anasınıfı A"): şube harfi atılarak aynı kademe aynı renge düşer
  const level = name.replace(/[\s/-]*[a-zçğıöşü]$/u, '');
  let h = 0;
  for (const ch of level) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_HUES[h % FALLBACK_HUES.length]!;
}

/** Ders ve öğretmen aynı satırda sırayla gösterilir; tüm satırlar birlikte döner */
function useAlternate(ms: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setOn((x) => !x), ms);
    return () => clearInterval(t);
  }, [ms]);
  return on;
}

export function LessonsCard({
  entries,
  heading,
  periodTitle,
}: {
  entries: DisplayState['timetable'];
  heading: string;
  periodTitle: string;
}) {
  const showTeacher = useAlternate(3500);
  return (
    <section className="card list-card lessons-card">
      <div className="card-label">
        <BookIcon size={22} /> {heading}
        <span className="card-label-aside">{periodTitle}</span>
      </div>
      <AutoPager
        items={entries}
        rowHeight={62}
        intervalMs={7000}
        keyOf={(e) => `${e.className}-${e.periodNo}`}
        empty="Bu ders saati için program girilmemiş"
        render={(e) => (
          <div className="lesson-row">
            <span className="lesson-class" style={{ '--row-hue': gradeHue(e.className) } as CSSProperties}>
              {e.className}
            </span>
            <span className="lesson-info">
              {showTeacher && e.teacherName ? (
                <span key="t" className="lesson-teacher lesson-swap">
                  {e.teacherName}
                </span>
              ) : (
                <span key="s" className="lesson-subject lesson-swap">
                  {e.subject}
                </span>
              )}
            </span>
          </div>
        )}
      />
    </section>
  );
}
