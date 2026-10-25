import {
  announcementOnAir,
  isSleepTime,
  quoteOfDay,
  SPECIAL_THEMES,
  todayInHistory,
  resolveLayout,
  resolveScreenDisplay,
  specialThemeFor,
  type AnnouncementDesign,
  type BoardModule,
  type DisplayAnnouncement,
  type LayoutItem,
  computeBellStatus,
  isBirthdayToday,
  isWithinWindow,
  periodLabel,
  pickSchedule,
  zonedParts,
} from '@okulpano/shared/client';
import type { CSSProperties, ReactNode } from 'react';
import type { DisplayAuth } from './api.ts';
import { EmergencyScreen } from './components/Emergency.tsx';
import { GroupCard } from './components/GroupCard.tsx';
import { Header } from './components/Header.tsx';
import { SpecialMark } from './components/SpecialMark.tsx';
import { BookIcon, CakeIcon, CalendarIcon, CapIcon, LibraryIcon, MonitorIcon, TrophyIcon, UserMinusIcon, WifiOffIcon } from './components/Icons.tsx';
import { AchievementsCard, BookCard, EventsCard } from './components/LifeCards.tsx';
import { BirthdayCard, DutyCard, EmptyCard, ExamCard, LeaveCard } from './components/LeftColumn.tsx';
import { BellCard, LessonsCard } from './components/RightColumn.tsx';
import { Screensaver } from './components/Screensaver.tsx';
import { Slideshow } from './components/Slideshow.tsx';
import { Stage, STAGE_H, STAGE_W } from './components/Stage.tsx';
import { Ticker, type TickerEntry } from './components/Ticker.tsx';
import { useClock, useDisplayData, useNightlyReload, useWeather } from './hooks.ts';

const NATIONAL_DAYS = new Set(['10-29', '04-23', '05-19', '08-30']);
/** "Ekim 2026" */
const monthName = (iso: string, timeZone: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone }).format(new Date(iso));

/** Sütunda kalan alanı dolduran kartlar (listeler) */
const GROW = new Set<BoardModule>(['duties', 'lessons', 'events']);

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

  const schedule = pickSchedule(state.bellSchedules, today.weekday);
  const bell = schedule ? computeBellStatus(schedule.periods, today.secondsOfDay, s.lunchThresholdMin) : ({ kind: 'off' } as const);
  const lessonPeriod = bell.kind === 'lesson' ? bell.period : bell.kind === 'break' || bell.kind === 'before' ? bell.next : null;
  const lessons = lessonPeriod
    ? state.timetable.filter((e) => e.weekday === today.weekday && e.periodNo === lessonPeriod.no)
    : [];

  // Yayın akışı: duyurunun günü, saat aralığı ve zilin durumu (ör. yalnızca teneffüste)
  const phase = bell.kind === 'lesson' ? 'lesson' : bell.kind === 'break' ? 'break' : 'other';
  const onAir = state.announcements.filter((a) => announcementOnAir(a.schedule, { weekday: today.weekday, secondsOfDay: today.secondsOfDay, phase }));


  // Okul hayatı kartları
  const achievementsNow = (state.achievements ?? []).filter((a) => isWithinWindow(nowMs, a.startsAt, a.endsAt));
  const book = (state.books ?? []).find((b) => isWithinWindow(nowMs, b.startsAt, b.endsAt)) ?? null;
  const events = (state.events ?? []).filter((e) => e.date >= today.isoDate);
  // Başarılar ve ayın öğrencisi duyurularda da hazır şablonla döner (motive edici, büyük ve fotoğraflı)
  const achievementSlides: DisplayAnnouncement[] = s.achievementSlides
    ? achievementsNow.map((a) => ({
        id: `achievement-${a.id}`,
        kind: 'design',
        title: a.name,
        body: null,
        imageUrl: null,
        youtubeUrl: null,
        durationSec: null,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        design: (a.kind === 'month'
            ? {
                template: 'monthStudent',
                palette: 'amber',
                fields: { name: a.name, class: a.className ?? '', month: monthName(a.startsAt ?? now.toISOString(), school.timezone), note: a.description ?? a.title, photo: a.photoUrl ?? '' },
              }
            : {
                template: 'achievement',
                palette: 'emerald',
                fields: { name: a.name + (a.className ? ` · ${a.className}` : ''), achievement: a.title, note: a.description ?? '', photo: a.photoUrl ?? '' },
              }) as AnnouncementDesign,
      }))
    : [];
  const slides = [...onAir, ...achievementSlides];

  // Kayan yazı: okulun metinleri + hava durumu uyarısı, bugün tarihte, günün sözü, RSS başlıkları
  const quote = quoteOfDay(today.isoDate);
  const ticker: TickerEntry[] = [
    ...(s.tickerWeatherAlerts ? (weather?.alerts ?? []).map((a) => ({ kind: 'weather' as const, tag: 'Hava uyarısı', text: a.text })) : []),
    ...state.ticker.filter((t) => isWithinWindow(nowMs, t.startsAt, t.endsAt)).map((t) => t.text),
    ...(s.tickerHistory ? todayInHistory(today.monthDay).map((x) => ({ kind: 'history' as const, tag: 'Bugün tarihte', text: x })) : []),
    ...(s.tickerQuote ? [{ kind: 'quote' as const, tag: 'Günün sözü', text: `“${quote.text}” — ${quote.by}` }] : []),
    ...(state.rss ?? []).map((r) => ({ kind: 'rss' as const, tag: r.source, text: r.title })),
  ];

  // Kartlar panonun düzenine göre (panoya özel ya da okulun) sol / sağ sütuna yerleşir
  const layout = state.layout ?? resolveLayout(s);
  // Düzende olup o gün içeriği olmayan kartlar kısa bir notla görünür (ayar kapalıysa hiç görünmez)
  const empty = (m: BoardModule, icon: ReactNode, title: string, message: string, className: string) =>
    s.showEmptyCards ? <EmptyCard key={m} icon={icon} title={title} message={message} className={className} /> : null;
  const renderModule = (m: BoardModule): ReactNode => {
    switch (m) {
      case 'exams':
        return state.exams.length > 0 ? (
          <ExamCard key={m} exams={state.exams} now={now} timezone={school.timezone} />
        ) : (
          empty(m, <CapIcon size={22} />, 'Sınav Sayacı', 'Yaklaşan sınav yok', 'exam-card')
        );
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
        return leaves.length > 0 ? <LeaveCard key={m} leaves={leaves} /> : empty(m, <UserMinusIcon size={22} />, 'İzinli Öğretmenler', 'Bugün izinli öğretmen yok', 'leave-card');
      case 'birthdays':
        return birthdays.length > 0 ? (
          <BirthdayCard key={m} birthdays={birthdays} nameFormat={s.birthdayNameFormat} />
        ) : (
          empty(m, <CakeIcon size={22} />, 'Doğum Günleri', 'Bugün doğum günü olan yok', 'birthday-card')
        );
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
        ) : (
          empty(m, <BookIcon size={22} />, 'Şu An Derste', 'Şu an ders yok', 'lessons-card')
        );
      case 'achievements':
        return achievementsNow.length ? (
          <AchievementsCard key={m} items={achievementsNow} />
        ) : (
          empty(m, <TrophyIcon size={22} />, 'Başarılarımız', 'Henüz eklenmiş başarı yok', 'achievements-card')
        );
      case 'events':
        return events.length ? (
          <EventsCard key={m} items={events} todayIso={today.isoDate} />
        ) : (
          empty(m, <CalendarIcon size={22} />, 'Etkinlik Takvimi', 'Yaklaşan etkinlik yok', 'events-card')
        );
      case 'book':
        return book ? <BookCard key={m} book={book} /> : empty(m, <LibraryIcon size={22} />, 'Haftanın Kitabı', 'Bu hafta kitap seçilmedi', 'book-card');
    }
  };
  // Birleşik kart: içindekilerden içeriği olanlar aynı yerde sırayla döner; hiçbirinde içerik yoksa
  // (boş kartlar açıksa) ilkinin kısa notu görünür
  const renderItem = (item: LayoutItem): ReactNode => {
    if (!Array.isArray(item)) return renderModule(item);
    const withContent = item.filter(hasContent);
    if (!withContent.length) return renderModule(item[0]!);
    if (withContent.length === 1) return renderModule(withContent[0]!);
    return <GroupCard key={item.join('+')} members={withContent.map((m) => ({ id: m, node: renderModule(m) }))} grow={item.some((m) => GROW.has(m))} />;
  };
  const hasContent = (m: BoardModule): boolean => {
    switch (m) {
      case 'exams':
        return state.exams.length > 0;
      case 'leaves':
        return leaves.length > 0;
      case 'birthdays':
        return birthdays.length > 0;
      case 'lessons':
        return Boolean(lessonPeriod);
      case 'achievements':
        return achievementsNow.length > 0;
      case 'events':
        return events.length > 0;
      case 'book':
        return Boolean(book);
      default:
        return true;
    }
  };
  const leftCards = layout.left.map(renderItem).filter(Boolean);
  const rightCards = layout.right.map(renderItem).filter(Boolean);

  const mourning = today.monthDay === '11-10';
  const silenceMinute = mourning && today.hour === 9 && (today.minute === 5 || today.minute === 6);

  // Özel günlerde (millî bayram, 10 Kasım, bayramlar…) hazır tema kendiliğinden uygulanır
  // Elle "Şimdi uygula" ile seçilen tema da filigranıyla gelir
  const special =
    (s.autoSpecialThemes ? specialThemeFor(today.isoDate) : null) ?? (s.specialTheme ? (SPECIAL_THEMES.find((t) => t.id === s.specialTheme) ?? null) : null);
  const display = resolveScreenDisplay(state.display);
  const portrait = display.orientation === 'portrait';
  const [stageW, stageH] = portrait ? [STAGE_H, STAGE_W] : [STAGE_W, STAGE_H];
  const classes = [
    'theme-' + s.theme,
    portrait ? 'orientation-portrait' : '',
    s.highContrast ? 'contrast-high' : '',
    s.textSize === 'large' ? 'text-large' : '',
    s.animations ? 'motion' : 'no-motion',
    NATIONAL_DAYS.has(today.monthDay) ? 'day-national' : '',
    mourning ? 'day-mourning' : '',
    special?.decor === 'festive' ? 'day-festive' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const themeVars = { '--primary': special?.primary ?? s.primaryColor, '--accent': special?.accent ?? s.accentColor } as CSSProperties;

  // Acil durum her şeyin önündedir: gece modu, yalnızca duyurular ve tam pano fark etmez
  if (state.emergency) {
    return (
      <Stage className={`${classes} mode-emergency`} style={themeVars} width={stageW} height={stageH}>
        <EmergencyScreen
          emergency={state.emergency}
          now={now}
          timezone={school.timezone}
          schoolName={school.name}
          schoolType={s.schoolType}
          logoUrl={school.logoUrl}
          // Yalnızca paneldeki küçük önizleme (iframe) sessizdir; "Tam ekran aç" ile açılan sekmede siren çalar
          muted={window.self !== window.top}
        />
      </Stage>
    );
  }

  // Gece / hafta sonu modu: ders dışı saatlerde ekran koruyucu ya da karartma
  const offDay = today.weekday >= 6 || (state.holidays ?? []).some((h) => h.date === today.isoDate);
  const sleeping = !identifying && isSleepTime({ settings: s, periods: schedule?.periods ?? null, secondsOfDay: today.secondsOfDay, offDay });

  if (sleeping && s.sleepMode === 'screensaver') {
    return (
      <Stage className={classes} style={themeVars} width={stageW} height={stageH}>
        <Screensaver now={now} timezone={school.timezone} schoolName={school.name} schoolType={s.schoolType} logoUrl={school.logoUrl} />
      </Stage>
    );
  }

  const slideshow = (full: boolean) => (
    <Slideshow
      announcements={slides}
      now={now}
      defaultDurationSec={s.slideDurationSec}
      videoSound={s.videoSound}
      schoolName={school.name}
      schoolType={s.schoolType}
      logoUrl={school.logoUrl}
      full={full}
    />
  );
  const overlays = (
    <>
      {sleeping && <div className="sleep-dim" />}
      {identifying && (
        <div className="identify">
          <MonitorIcon size={120} />
          <div className="identify-name">{state.screen?.name ?? 'Önizleme'}</div>
          <div className="identify-sub">Bu ekran panelden tanımlandı</div>
        </div>
      )}
    </>
  );

  // Yalnızca duyurular: ek TV'ler için tam ekran slayt, köşede küçük saat
  if (display.mode === 'slides') {
    return (
      <Stage className={`${classes} mode-slides`} style={themeVars} width={stageW} height={stageH}>
        {slideshow(true)}
        <div className="corner-clock">{new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: school.timezone }).format(now)}</div>
        {overlays}
      </Stage>
    );
  }

  return (
    <Stage className={classes} style={themeVars} width={stageW} height={stageH}>
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
        specialId={special?.id}
        showWeatherAlert={s.showWeatherAlert}
      />
      {special && <SpecialMark id={special.id} className="special-mark-bg" />}

      <main className="body">
        {leftCards.length > 0 && <aside className="col col-left">{leftCards}</aside>}

        {slideshow(false)}

        {rightCards.length > 0 && <aside className="col col-right">{rightCards}</aside>}
      </main>

      <Ticker items={ticker.length ? ticker : [`${school.name} · İyi dersler dileriz`]} speed={s.tickerSpeed} />

      {overlays}

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
