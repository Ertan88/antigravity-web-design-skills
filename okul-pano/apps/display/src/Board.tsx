import {
  resolveLayout,
  specialThemeFor,
  type BoardModule,
  computeBellStatus,
  isBirthdayToday,
  isWithinWindow,
  periodLabel,
  pickSchedule,
  zonedParts,
} from '@okulpano/shared/client';
import type { CSSProperties, ReactNode } from 'react';
import type { DisplayAuth } from './api.ts';
import { Header } from './components/Header.tsx';
import { MonitorIcon, WifiOffIcon } from './components/Icons.tsx';
import { BirthdayCard, DutyCard, ExamCard, LeaveCard } from './components/LeftColumn.tsx';
import { BellCard, LessonsCard } from './components/RightColumn.tsx';
import { Slideshow } from './components/Slideshow.tsx';
import { Stage } from './components/Stage.tsx';
import { Ticker } from './components/Ticker.tsx';
import { useClock, useDisplayData, useNightlyReload, useWeather } from './hooks.ts';

const NATIONAL_DAYS = new Set(['10-29', '04-23', '05-19', '08-30']);

export function Board({ auth, onUnauthorized }: { auth: DisplayAuth; onUnauthorized: () => void }) {
  const { state, connection, lastUpdated, offsetMs, identifying } = useDisplayData(auth, onUnauthorized);
  const now = useClock(offsetMs);
  const weather = useWeather(auth.token);
  useNightlyReload(!auth.preview);

  if (!state) {
    return (
      <Stage className="theme-dark">
        <div className="splash">
          <MonitorIcon size={96} />
          <div className="splash-title">Okul Pano</div>
          <div className="splash-sub">
            {connection === 'offline' ? (
              <>
                <WifiOffIcon size={24} /> Sunucuya bağlanılamıyor, yeniden deneniyor…
              </>
            ) : connection === 'unauthorized' ? (
              'Önizleme süresi doldu. Paneli yenileyin.'
            ) : (
              'Yükleniyor…'
            )}
          </div>
        </div>
      </Stage>
    );
  }

  const { school } = state;
  const s = school.settings;
  const today = zonedParts(now, school.timezone);
  const nowMs = now.getTime();

  const duties = state.duties.filter((d) => d.weekday === today.weekday);
  const leaves = state.leaves.filter((l) => l.startDate <= today.isoDate && l.endDate >= today.isoDate);
  const birthdays = state.birthdays.filter((b) => isBirthdayToday(b.monthDay, today));
  const ticker = state.ticker.filter((t) => isWithinWindow(nowMs, t.startsAt, t.endsAt)).map((t) => t.text);

  const schedule = pickSchedule(state.bellSchedules, today.weekday);
  const bell = schedule ? computeBellStatus(schedule.periods, today.secondsOfDay, s.lunchThresholdMin) : ({ kind: 'off' } as const);
  const lessonPeriod = bell.kind === 'lesson' ? bell.period : bell.kind === 'break' || bell.kind === 'before' ? bell.next : null;
  const lessons = lessonPeriod
    ? state.timetable.filter((e) => e.weekday === today.weekday && e.periodNo === lessonPeriod.no)
    : [];

  // Kartlar panonun düzenine göre (panoya özel ya da okulun) sol / sağ sütuna yerleşir
  const layout = state.layout ?? resolveLayout(s);
  const renderModule = (m: BoardModule): ReactNode => {
    switch (m) {
      case 'exams':
        return state.exams.length > 0 ? <ExamCard key={m} exams={state.exams} now={now} timezone={school.timezone} /> : null;
      case 'duties':
        return (
          <DutyCard
            key={m}
            duties={duties}
            supervisor={(state.dutySupervisors ?? []).find((x) => x.date === today.isoDate)?.name ?? null}
            transport={(state.transportDuties ?? []).find((x) => x.date === today.isoDate)?.teacherNames ?? []}
            holiday={(state.holidays ?? []).find((x) => x.date === today.isoDate)?.name ?? null}
          />
        );
      case 'leaves':
        return leaves.length > 0 ? <LeaveCard key={m} leaves={leaves} /> : null;
      case 'birthdays':
        return birthdays.length > 0 ? <BirthdayCard key={m} birthdays={birthdays} nameFormat={s.birthdayNameFormat} /> : null;
      case 'bell':
        return <BellCard key={m} status={bell} />;
      case 'lessons':
        return lessonPeriod ? (
          <LessonsCard
            key={m}
            entries={lessons}
            heading={bell.kind === 'lesson' ? 'Şu An Derste' : 'Sıradaki Ders'}
            periodTitle={bell.kind === 'lesson' ? periodLabel(lessonPeriod) : `${periodLabel(lessonPeriod)} · ${lessonPeriod.start}`}
          />
        ) : null;
    }
  };
  const leftCards = layout.left.map(renderModule).filter(Boolean);
  const rightCards = layout.right.map(renderModule).filter(Boolean);

  const mourning = today.monthDay === '11-10';
  const silenceMinute = mourning && today.hour === 9 && (today.minute === 5 || today.minute === 6);

  // Özel günlerde (millî bayram, 10 Kasım, bayramlar…) hazır tema kendiliğinden uygulanır
  const special = s.autoSpecialThemes ? specialThemeFor(today.isoDate) : null;
  const classes = [
    'theme-' + s.theme,
    NATIONAL_DAYS.has(today.monthDay) ? 'day-national' : '',
    mourning ? 'day-mourning' : '',
    special?.decor === 'festive' ? 'day-festive' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const themeVars = { '--primary': special?.primary ?? s.primaryColor, '--accent': special?.accent ?? s.accentColor } as CSSProperties;

  return (
    <Stage className={classes} style={themeVars}>
      <Header
        schoolName={school.name}
        schoolType={s.schoolType}
        logoUrl={school.logoUrl}
        timezone={school.timezone}
        now={now}
        weather={weather}
        city={school.city}
        connection={connection}
        lastUpdated={lastUpdated}
      />

      <main className="body">
        {leftCards.length > 0 && <aside className="col col-left">{leftCards}</aside>}

        <Slideshow
          announcements={state.announcements}
          now={now}
          defaultDurationSec={s.slideDurationSec}
          videoSound={s.videoSound}
          schoolName={school.name}
          logoUrl={school.logoUrl}
        />

        {rightCards.length > 0 && <aside className="col col-right">{rightCards}</aside>}
      </main>

      <Ticker items={ticker.length ? ticker : [`${school.name} · İyi dersler dileriz`]} speed={s.tickerSpeed} />

      {identifying && (
        <div className="identify">
          <MonitorIcon size={120} />
          <div className="identify-name">{state.screen?.name ?? 'Önizleme'}</div>
          <div className="identify-sub">Bu ekran panelden tanımlandı</div>
        </div>
      )}

      {silenceMinute && (
        <div className="silence">
          <div className="silence-date">10 Kasım 1938 · 09.05</div>
          <div className="silence-text">
            Cumhuriyetimizin kurucusu Gazi Mustafa Kemal Atatürk'ü
            <br />
            saygı, sevgi ve özlemle anıyoruz.
          </div>
        </div>
      )}
    </Stage>
  );
}
