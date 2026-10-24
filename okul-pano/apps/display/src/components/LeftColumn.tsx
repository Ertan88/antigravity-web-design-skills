import { countdown, formatPersonName, type DisplayState } from '@okulpano/shared/client';
import { AutoPager } from './AutoPager.tsx';
import { CakeIcon, CapIcon, ShieldIcon, UserMinusIcon } from './Icons.tsx';

const pad = (n: number) => String(n).padStart(2, '0');
const shortDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function ExamCard({ exams, now, timezone }: { exams: DisplayState['exams']; now: Date; timezone: string }) {
  const [first, ...rest] = exams;
  if (!first) return null;
  const c = countdown(Date.parse(first.examAt), now.getTime());
  const examDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone });

  return (
    <section className="card exam-card">
      <div className="card-label">
        <CapIcon size={22} /> Sınav Sayacı
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

export function DutyCard({ duties, weekdayName }: { duties: DisplayState['duties']; weekdayName: string }) {
  return (
    <section className="card list-card duty-card">
      <div className="card-label">
        <ShieldIcon size={22} /> Nöbetçi Öğretmenler
        <span className="card-label-aside">{weekdayName}</span>
      </div>
      <AutoPager
        items={duties}
        rowHeight={54}
        keyOf={(d) => d.id}
        empty="Bugün nöbet çizelgesi yok"
        render={(d) => (
          <div className="duty-row">
            <span className="duty-area">{d.area}</span>
            <span className="duty-teacher">{d.teacherName}</span>
          </div>
        )}
      />
    </section>
  );
}

export function LeaveCard({ leaves, todayIso }: { leaves: DisplayState['leaves']; todayIso: string }) {
  return (
    <section className="card list-card leave-card">
      <div className="card-label">
        <UserMinusIcon size={22} /> İzinli Öğretmenler
      </div>
      <AutoPager
        items={leaves}
        layout="chips"
        pageSize={4}
        keyOf={(l) => l.id}
        render={(l) => (
          <>
            <span className="person-name">{l.teacherName}</span>
            {l.endDate > todayIso && <span className="person-meta">son gün {shortDate.format(new Date(`${l.endDate}T00:00:00Z`))}</span>}
          </>
        )}
      />
    </section>
  );
}

export function BirthdayCard({ birthdays, nameFormat }: { birthdays: DisplayState['birthdays']; nameFormat: 'full' | 'initial' }) {
  return (
    <section className="card list-card birthday-card">
      <div className="card-label">
        <CakeIcon size={22} /> İyi ki doğdun!
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
