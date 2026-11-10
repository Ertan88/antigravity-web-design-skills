import { formatDuration, gradeHue, groupExams, periodLabel, type BellStatus, type DisplayState } from '@okulpano/shared/client';
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
  /** Aynı anda başka zil çalan sınıflar: "12. sınıflar · 7. Ders · 7 dk" */
  extras?: { label: string; text: string }[];
  /** Kart okul zili yerine bir sınıf grubunun zilini gösteriyorsa grubun adı (ör. okul zili bitti, 12'ler derste) */
  owner?: string | null;
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
        <span className="card-label-aside">{day?.owner ? `${day.owner} · ${d.title}` : d.title}</span>
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
      {day?.extras?.map((x) => (
        <div key={x.label} className="bell-extra">
          <span className="bell-extra-label">{x.label}</span>
          <span>{x.text}</span>
        </div>
      ))}
    </section>
  );
}

/** Şu an derste / sıradaki ders: sınıf etiketi, ders adı (gerekirse iki satır) ve altında öğretmen(ler) */
type ScheduledExam = NonNullable<DisplayState['scheduledExams']>[number];

/**
 * Şu an derste (teneffüste: sıradaki ders). Sınavı olan sınıfın satırı vurgulanır (SINAV etiketi) ve
 * listenin başına alınır; başlıkta kaç sınıfta sınav olduğu yazar. Altta, bugün daha sonraki sınavlar ders
 * saatine göre tek satırlarda (aynı kademenin aynı sınavı "9. sınıflar Matematik" diye toplanır).
 */
export function LessonsCard({
  entries,
  heading,
  periodTitle,
  examsBySlot,
  laterExams = [],
  nowClock,
}: {
  entries: DisplayState['timetable'];
  heading: string;
  periodTitle: string;
  /** Bugünün sınavları, "<sınıf id>|<ders no>" anahtarıyla */
  examsBySlot?: ReadonlyMap<string, ScheduledExam>;
  /** Kartın altında gösterilecek, daha sonraki sınavlar */
  laterExams?: ScheduledExam[];
  nowClock?: string;
}) {
  const examOf = (e: DisplayState['timetable'][number]) => (e.classId ? examsBySlot?.get(`${e.classId}|${e.periodNo}`) : undefined);
  const examCount = entries.filter((e) => examOf(e)).length;
  // Sınavı olan sınıflar başa (kendi aralarında ve diğerleri aynı sırada kalır)
  const rows = examCount ? [...entries].sort((a, b) => Number(Boolean(examOf(b))) - Number(Boolean(examOf(a)))) : entries;
  const later = [...new Set(laterExams.map((e) => e.periodNo))]
    .sort((a, b) => a - b)
    .map((periodNo) => {
      const items = laterExams.filter((e) => e.periodNo === periodNo);
      return { periodNo, start: items[0]!.start, groups: groupExams(items) };
    });
  return (
    <section className="card list-card lessons-card">
      <div className="card-label">
        <BookIcon size={22} /> {heading}
        <span className="card-label-aside">
          {periodTitle}
          {examCount > 0 && <span className="lessons-exam-count"> · {examCount} sınavda</span>}
        </span>
      </div>
      <AutoPager
        items={rows}
        // Ders adı iki satıra inebilir, öğretmen(ler) altında: satır yüksekliği buna göre
        rowHeight={88}
        intervalMs={8000}
        keyOf={(e) => `${e.className}-${e.periodNo}`}
        empty="Bu ders saati için program girilmemiş"
        render={(e) => {
          const x = examOf(e);
          const started = Boolean(x?.start && nowClock && x.start <= nowClock);
          return (
            <div className={`lesson-row${x ? ' exam-row' : ''}${started ? ' exam-now' : ''}`}>
              <ClassBadge name={e.className} />
              <span className="lesson-info">
                <span className="lesson-subject">{e.subject}</span>
                {/* Sınav satırında da öğretmen adı tam görünür: sınavı SINAV etiketi ve satırın rengi söyler */}
                {e.teacherName && <span className="lesson-teacher">{e.teacherName}</span>}
              </span>
              {x && <span className="exam-badge">Sınav</span>}
            </div>
          );
        }}
      />
      {later.length > 0 && (
        <div className="exam-later">
          <div className="exam-later-title">Bugün sonraki sınavlar</div>
          {later.slice(0, 2).map((p) => (
            <div key={p.periodNo} className="exam-later-row">
              <span className="exam-later-time">
                {p.periodNo}. ders{p.start ? ` ${p.start}` : ''}
              </span>
              <span className="exam-later-list">
                {p.groups.map((g) => (
                  <span key={g.key}>
                    <b>{g.label}</b> {g.items[0]!.subject}
                  </span>
                ))}
              </span>
            </div>
          ))}
          {later.length > 2 && <div className="exam-later-more">ve {later.slice(2).reduce((n, p) => n + p.groups.length, 0)} sınav daha</div>}
        </div>
      )}
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
