import type { ReactNode } from 'react';
import { countdown, formatPersonName, type DisplayState } from '@okulpano/shared/client';
import { AutoPager } from './AutoPager.tsx';
import { useLabel } from './Labels.tsx';
import { CakeIcon, CapIcon, HourglassIcon, ShieldIcon, UserMinusIcon } from './Icons.tsx';

const pad = (n: number) => String(n).padStart(2, '0');

export function ExamCard({ exams, now, timezone }: { exams: DisplayState['exams']; now: Date; timezone: string }) {
  const [first, ...rest] = exams;
  const title = useLabel('exams');
  if (!first) return null;
  const c = countdown(Date.parse(first.examAt), now.getTime());
  const examDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone });

  return (
    <section className="card exam-card">
      <HourglassIcon className="card-watermark watermark-exam" size={210} strokeWidth={1.4} />
      <div className="card-label">
        <CapIcon size={22} /> {title}
        <span className="card-label-aside">{examDate.format(new Date(first.examAt))}</span>
      </div>
      <div className="exam-title">{first.title}</div>
      {c.done ? (
        <div className="exam-done">Sınav günü · Başarılar!</div>
      ) : (
        <div className="exam-units">
          <div className="exam-unit exam-unit-days">
            <strong>{c.days}</strong>
            <span>gün</span>
          </div>
          <div className="exam-unit">
            <strong>{pad(c.hours)}</strong>
            <span>saat</span>
          </div>
          <div className="exam-unit">
            <strong>{pad(c.minutes)}</strong>
            <span>dakika</span>
          </div>
          <div className="exam-unit">
            <strong>{pad(c.seconds)}</strong>
            <span>saniye</span>
          </div>
        </div>
      )}
      {rest.slice(0, 2).map((e) => (
        <div className="exam-next" key={e.id}>
          <span>{e.title}</span>
          <span>
            {countdown(Date.parse(e.examAt), now.getTime()).days} gün · {examDate.format(new Date(e.examAt))}
          </span>
        </div>
      ))}
    </section>
  );
}

export function DutyCard({
  duties,
  supervisor,
  transport,
  holiday,
}: {
  duties: DisplayState['duties'];
  /** Bugünün nöbetçi müdür yardımcısı */
  supervisor: string | null;
  /** Bugünün taşımalı öğrenci görevlileri */
  transport: string[];
  /** Bugün tatilse adı: nöbet listesi yerine gösterilir */
  holiday: string | null;
}) {
  // Panoda kısa ad; okul kendi başlığını verdiyse o
  const supervisorLabel = useLabel('supervisor', 'Nöbetçi Müdür Yrd.');
  const transportLabel = useLabel('transport');
  return (
    <section className="card list-card duty-card">
      <div className="card-label">
        <ShieldIcon size={22} /> {useLabel('dutyCard')}
      </div>
      {holiday ? (
        <div className="duty-holiday">
          <span className="duty-holiday-label">Bugün tatil</span>
          <span className="duty-holiday-name">{holiday}</span>
        </div>
      ) : (
      <AutoPager
          items={duties}
          rowHeight={64}
          keyOf={(d) => d.id}
          empty="Bugün nöbet çizelgesi yok"
          render={(d) => (
            <div className="duty-row">
              <span className="duty-area">{d.area}</span>
              <span className="duty-teacher">{d.teacherName}</span>
            </div>
          )}
        />
      )}
      {!holiday && (supervisor || transport.length > 0) && (
        <div className="duty-extras">
          {supervisor && (
            <div className="duty-extra">
              <span className="duty-extra-label">{supervisorLabel}</span>
              <span className="duty-extra-name">{supervisor}</span>
            </div>
          )}
          {transport.length > 0 && (
            <div className="duty-extra duty-extra-transport">
              <span className="duty-extra-label">{transportLabel}</span>
              <span className="duty-extra-name">{transport.join(' · ')}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Düzende olup o gün içeriği olmayan kart: başlık ve kısa bir not, az yer kaplar */
export function EmptyCard({ icon, title, message, className = '' }: { icon: ReactNode; title: string; message: string; className?: string }) {
  return (
    <section className={`card empty-card ${className}`}>
      <div className="card-label">
        {icon} {title}
      </div>
      <div className="empty-card-text">{message}</div>
    </section>
  );
}

export function LeaveCard({ leaves }: { leaves: DisplayState['leaves'] }) {
  return (
    <section className="card list-card leave-card">
      <div className="card-label">
        <UserMinusIcon size={22} /> {useLabel('leaves')}
      </div>
      <AutoPager
        items={leaves}
        layout="chips"
        pageSize={6}
        keyOf={(l) => l.id}
        render={(l) => <span className="person-name">{l.teacherName}</span>}
      />
    </section>
  );
}

export function BirthdayCard({ birthdays, nameFormat }: { birthdays: DisplayState['birthdays']; nameFormat: 'full' | 'initial' }) {
  return (
    <section className="card list-card birthday-card">
      <div className="card-label">
        <CakeIcon size={22} /> {useLabel('birthdays')}
      </div>
      <AutoPager
        items={birthdays}
        layout="chips"
        pageSize={4}
        intervalMs={6000}
        keyOf={(b) => b.id}
        render={(b) => (
          <>
            <span className="person-name">{formatPersonName(b.name, nameFormat)}</span>
            {b.className && <span className="person-meta">{b.className}</span>}
          </>
        )}
      />
    </section>
  );
}
