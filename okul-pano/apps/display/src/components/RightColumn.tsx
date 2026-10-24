import { formatDuration, periodLabel, type BellStatus, type DisplayState } from '@okulpano/shared/client';
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

export function LessonsCard({
  entries,
  heading,
  periodTitle,
}: {
  entries: DisplayState['timetable'];
  heading: string;
  periodTitle: string;
}) {
  return (
    <section className="card list-card lessons-card">
      <div className="card-label">
        <BookIcon size={22} /> {heading}
        <span className="card-label-aside">{periodTitle}</span>
      </div>
      <AutoPager
        items={entries}
        rowHeight={66}
        intervalMs={7000}
        keyOf={(e) => `${e.className}-${e.periodNo}`}
        empty="Bu ders saati için program girilmemiş"
        render={(e) => (
          <div className="lesson-row">
            <span className="lesson-class">{e.className}</span>
            <span className="lesson-info">
              <span className="lesson-subject">{e.subject}</span>
              {e.teacherName && <span className="lesson-teacher">{e.teacherName}</span>}
            </span>
          </div>
        )}
      />
    </section>
  );
}
