import { formatDuration, gradeHue, periodLabel, type BellStatus, type DisplayState } from '@okulpano/shared/client';
import type { CSSProperties } from 'react';
import { AutoPager } from './AutoPager.tsx';
import { useLabel } from './Labels.tsx';
import { BellIcon, BellWatermarkIcon, BookIcon, CoffeeIcon, UtensilsIcon } from './Icons.tsx';

/** Zil kartının gün bilgisi: tatil, arife (yarım gün) ve sonraki ders günü */
export interface BellDayContext {
  /** Bugün tam gün tatilse adı */
  holiday?: string | null;
  /** Bugün arifeyse adı (dersler `endsAt` saatinde biter) */
  halfDay?: string | null;
  endsAt?: string | null;
  /** Dersler bitince ya da tatilde: "Yarın tatil · …", "Sonraki ders günü: …" */
  upcoming?: string | null;
}

export function describeBell(status: BellStatus, ctx: BellDayContext = {}) {
  const wish = (name: string) => (/bayram/i.test(name) ? 'İyi bayramlar' : 'İyi tatiller');
  switch (status.kind) {
    case 'lesson':
      return {
        title: periodLabel(status.period),
        caption: 'Dersin bitmesine',
        range: `${status.period.start} – ${status.period.end}`,
        next: status.next ? `Sıradaki: ${periodLabel(status.next)} · ${status.next.start}` : ctx.halfDay ? 'Son ders · öğleden sonra tatil' : 'Son ders',
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
        next: ctx.halfDay ? `Yarım gün · son zil ${ctx.endsAt}` : `${periodLabel(status.next)} · ${status.next.start} – ${status.next.end}`,
        remaining: status.remainingSec,
        progress: null,
        tone: 'idle',
      };
    case 'after':
      if (ctx.halfDay) {
        return {
          title: 'Öğleden sonra tatil',
          caption: wish(ctx.halfDay),
          range: ctx.halfDay,
          next: ctx.upcoming ?? null,
          remaining: null,
          progress: null,
          tone: 'idle',
        };
      }
      return {
        title: 'Dersler sona erdi',
        caption: 'İyi akşamlar',
        range: `Son ders ${status.last.end}'de bitti`,
        next: ctx.upcoming ?? null,
        remaining: null,
        progress: null,
        tone: 'idle',
      };
    default:
      if (ctx.holiday) {
        return { title: 'Bugün tatil', caption: ctx.holiday, range: wish(ctx.holiday), next: ctx.upcoming ?? null, remaining: null, progress: null, tone: 'idle' };
      }
      return { title: 'Bugün ders yok', caption: 'İyi tatiller', range: null, next: ctx.upcoming ?? null, remaining: null, progress: null, tone: 'idle' };
  }
}

export function BellCard({ status, day }: { status: BellStatus; day?: BellDayContext }) {
  const d = describeBell(status, day);
  const urgent = d.remaining != null && d.remaining <= 60 && (status.kind === 'lesson' || status.kind === 'break');
  const Glyph = d.tone === 'lunch' ? UtensilsIcon : d.tone === 'break' ? CoffeeIcon : BellIcon;

  return (
    <section className={`card bell-card tone-${d.tone} ${urgent ? 'urgent' : ''}`}>
      <BellWatermarkIcon className="card-watermark watermark-bell" size={210} strokeWidth={1.4} />
      <div className="card-label">
        <Glyph size={22} /> {useLabel('bell')}
        <span className="card-label-aside">{d.title}</span>
      </div>
      {d.remaining != null ? (
        <div className="bell-main">
          <div className="bell-countdown">{formatDuration(d.remaining)}</div>
          <div className="bell-caption">{d.caption}</div>
        </div>
      ) : (
        <div className="bell-caption bell-caption-lg">{d.caption}</div>
      )}
      {d.progress != null && (
        <div className="bell-progress" role="progressbar" aria-valuenow={Math.round(d.progress * 100)}>
          <div style={{ width: `${Math.min(100, d.progress * 100)}%` }} />
        </div>
      )}
      {(d.range || d.next) && (
        // Geri sayım yokken (dersler bitti, tatil) bilgiler alt alta ve tam görünür
        <div className={`bell-foot${d.remaining == null ? ' is-stack' : ''}`}>
          {d.range && <span className="bell-range">{d.range}</span>}
          {d.next && <span className="bell-next">{d.next}</span>}
        </div>
      )}
    </section>
  );
}

/** Şu an derste / sıradaki ders: sınıf etiketi, ders adı (gerekirse iki satır) ve altında öğretmen(ler) */
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
        // Ders adı iki satıra inebilir, öğretmen(ler) altında: satır yüksekliği buna göre
        rowHeight={88}
        intervalMs={8000}
        keyOf={(e) => `${e.className}-${e.periodNo}`}
        empty="Bu ders saati için program girilmemiş"
        render={(e) => (
          <div className="lesson-row">
            <ClassBadge name={e.className} />
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

/**
 * Sınıf etiketi: hep aynı boyda; "9/A" büyük, program kısaltması (ATP) varsa üstünde küçük harfle. Böylece
 * "9/A" ile "ATP 10/A" aynı genişlikte durur, ders adları aynı hizadan başlar.
 */
export function ClassBadge({ name }: { name: string }) {
  const m = /^(\S+)\s+(\d.*)$/.exec(name);
  const program = m ? m[1] : null;
  const label = m ? m[2]! : name;
  return (
    <span className="lesson-class" style={{ '--row-hue': gradeHue(name) } as CSSProperties}>
      {program && <small className="lesson-program">{program}</small>}
      <span className="lesson-label">{label}</span>
    </span>
  );
}
