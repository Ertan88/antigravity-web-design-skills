import {
  achievementDesign,
  announcementOnAir,
  isHalfDayHoliday,
  isSleepTime,
  quoteOfDay,
  SPECIAL_THEMES,
  todayInHistory,
  resolveLayout,
  resolveScreenDisplay,
  specialThemeFor,
  type BoardModule,
  type DisplayAnnouncement,
  type LayoutItem,
  type ScreenLiveStatus,
  computeBellStatus,
  isBirthdayToday,
  isWithinWindow,
  periodLabel,
  pickSchedule,
  zonedParts,
  labelOf,
  type LabelKey,
} from '@okulpano/shared/client';
import type { CSSProperties, ReactNode } from 'react';
import type { DisplayAuth } from './api.ts';
import { EmergencyScreen } from './components/Emergency.tsx';
import { GroupCard } from './components/GroupCard.tsx';
import { Header } from './components/Header.tsx';
import { ClockScreen } from './components/Remote.tsx';
import { BrandMark, BrandName } from './components/Brand.tsx';
import { LabelsContext } from './components/Labels.tsx';
import { SpecialMark } from './components/SpecialMark.tsx';
import { BookIcon, CakeIcon, CalendarIcon, CapIcon, LibraryIcon, MonitorIcon, ShieldIcon, TrophyIcon, UserMinusIcon, WifiOffIcon } from './components/Icons.tsx';
import { AchievementsCard, BookCard, EventsCard } from './components/LifeCards.tsx';
import { BirthdayCard, DutyCard, EmptyCard, ExamCard, LeaveCard } from './components/LeftColumn.tsx';
import { BellCard, LessonsCard } from './components/RightColumn.tsx';
import { Screensaver } from './components/Screensaver.tsx';
import { Slideshow } from './components/Slideshow.tsx';
import { Stage, STAGE_H, STAGE_W } from './components/Stage.tsx';
import { Ticker, type TickerEntry } from './components/Ticker.tsx';
import { useClock, useDisplayData, useNightlyReload, useStatusReport, useWeather } from './hooks.ts';
import { useCallback, useEffect, useState } from 'react';

const NATIONAL_DAYS = new Set(['10-29', '04-23', '05-19', '08-30']);
/** "Ekim 2026" */
const monthName = (iso: string, timeZone: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone }).format(new Date(iso));

/** Açılış ekranı en az bu kadar görünür; ilerleme çubuğu bu sürede dolar */
const SPLASH_MIN_MS = 2600;

/** Açılış ekranı: veri gelse de en az SPLASH_MIN_MS görünür, sonra çubuk tamamlanıp kapanır (önizlemelerde de) */
function useSplash(ready: boolean) {
  const [minDone, setMinDone] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);
  const finishing = ready && minDone;
  useEffect(() => {
    if (!finishing || hidden) return;
    const t = setTimeout(() => setHidden(true), 350);
    return () => clearTimeout(t);
  }, [finishing, hidden]);
  return { show: !ready || !hidden, finishing };
}

/** Sütunda kalan alanı dolduran kartlar (listeler) */
const GROW = new Set<BoardModule>(['duties', 'lessons', 'events']);

export function Board({ auth, onUnauthorized }: { auth: DisplayAuth; onUnauthorized: () => void }) {
  const { state, connection, lastUpdated, offsetMs, identifying, remote, power } = useDisplayData(auth, onUnauthorized);
  const now = useClock(offsetMs);
  const weather = useWeather(auth.token);
  useNightlyReload(!auth.preview);
  // Mobil uzaktan kumanda için: şu an gösterilen slayt ve panonun durumu sunucuya bildirilir
  const [shown, setShown] = useState<{ index: number; count: number; title: string | null }>({ index: 0, count: 0, title: null });
  const onShow = useCallback((v: { index: number; count: number; title: string | null }) => setShown(v), []);
  const splash = useSplash(Boolean(state));

  if (!state || splash.show) {
    return (
      <Stage className="theme-dark">
        <div className="splash">
          <BrandMark size={120} className="splash-mark" />
          <BrandName className="splash-title" />
          <div className="splash-slogan">Okulunuzun Her Anı, Tek Ekranda</div>
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
          {connection !== 'unauthorized' && (
            <div className={`splash-progress${splash.finishing ? ' is-done' : ''}`} role="progressbar" aria-label="Yükleniyor">
              <span />
            </div>
          )}
        </div>
      </Stage>
    );
  }

  const { school } = state;
  const s = school.settings;
  const today = zonedParts(now, school.timezone);
  const nowMs = now.getTime();

  // Nöbet yerine görevlendirme: o gün nöbeti başka öğretmen tutuyorsa onun adı görünür
  const substitutes = new Map((state.dutySubstitutions ?? []).filter((x) => x.date === today.isoDate).map((x) => [x.dutyId, x.teacherName]));
  const duties = state.duties.filter((d) => d.weekday === today.weekday).map((d) => (substitutes.has(d.id) ? { ...d, teacherName: substitutes.get(d.id)! } : d));
  const leaves = state.leaves.filter((l) => l.startDate <= today.isoDate && l.endDate >= today.isoDate);
  const birthdays = state.birthdays.filter((b) => isBirthdayToday(b.monthDay, today));

  const schedule = pickSchedule(state.bellSchedules, today.weekday);
  // Resmî / dini tatilde (arife yarım gün hariç) zil ve dersler çalışmaz
  const fullHoliday = (state.holidays ?? []).some((h) => h.date === today.isoDate && !isHalfDayHoliday(h.name));
  const periods = schedule && !fullHoliday ? schedule.periods : null;
  const bell = periods ? computeBellStatus(periods, today.secondsOfDay, s.lunchThresholdMin) : ({ kind: 'off' } as const);
  const lessonPeriod = bell.kind === 'lesson' ? bell.period : bell.kind === 'break' || bell.kind === 'before' ? bell.next : null;
  const lessons = lessonPeriod
    ? state.timetable.filter((e) => e.weekday === today.weekday && e.periodNo === lessonPeriod.no)
    : [];

  // Yayın akışı: duyurunun günü, saat aralığı ve zilin durumu (ör. yalnızca teneffüste)
  const phase = bell.kind === 'lesson' ? 'lesson' : bell.kind === 'break' ? 'break' : 'other';
  const onAir = state.announcements.filter((a) => announcementOnAir(a.schedule, { weekday: today.weekday, secondsOfDay: today.secondsOfDay, phase }));


  // Okul hayatı kartları
  const achievementsLive = (state.achievements ?? []).filter((a) => isWithinWindow(nowMs, a.startsAt, a.endsAt));
  // Her başarı için ayrı seçim: Başarılar kartında ve / veya duyuru alanında
  const achievementsNow = achievementsLive.filter((a) => a.showCard !== false);
  const book = (state.books ?? []).find((b) => isWithinWindow(nowMs, b.startsAt, b.endsAt)) ?? null;
  const events = (state.events ?? []).filter((e) => e.date >= today.isoDate);
  // Başarılar ve ayın öğrencisi duyurularda da hazır şablonla döner (motive edici, büyük ve fotoğraflı)
  const achievementSlides: DisplayAnnouncement[] = s.achievementSlides
    ? achievementsLive.filter((a) => a.showSlide !== false).map((a) => ({
        id: `achievement-${a.id}`,
        kind: 'design',
        title: a.name,
        body: null,
        imageUrl: null,
        youtubeUrl: null,
        durationSec: null,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        design: achievementDesign(a, monthName(a.startsAt ?? now.toISOString(), school.timezone)),
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
  const label = (key: LabelKey) => labelOf(s.labels, key);
  // Kartlar okulun başlıklarını kullanır (Panel › Başlıklar)
  const renderModule = (m: BoardModule): ReactNode => {
    const node = renderCard(m);
    return node ? (
      <LabelsContext.Provider key={m} value={s.labels}>
        {node}
      </LabelsContext.Provider>
    ) : null;
  };
  const renderCard = (m: BoardModule): ReactNode => {
    switch (m) {
      case 'exams':
        return state.exams.length > 0 ? (
          <ExamCard key={m} exams={state.exams} now={now} timezone={school.timezone} />
        ) : (
          empty(m, <CapIcon size={22} />, label('exams'), 'Yaklaşan sınav yok', 'exam-card')
        );
      case 'duties':
        return !hasContent(m) ? (
          empty(m, <ShieldIcon size={22} />, label('dutyCard'), 'Bugün nöbet çizelgesi yok', 'duty-card')
        ) : (
          <DutyCard
            key={m}
            duties={duties}
            supervisor={(state.dutySupervisors ?? []).find((x) => x.date === today.isoDate)?.name ?? null}
            transport={(state.transportDuties ?? []).find((x) => x.date === today.isoDate)?.teacherNames ?? []}
            holiday={(state.holidays ?? []).find((x) => x.date === today.isoDate)?.name ?? null}
          />
        );
      case 'leaves':
        return leaves.length > 0 ? <LeaveCard key={m} leaves={leaves} /> : empty(m, <UserMinusIcon size={22} />, label('leaves'), 'Bugün izinli öğretmen yok', 'leave-card');
      case 'birthdays':
        return birthdays.length > 0 ? (
          <BirthdayCard key={m} birthdays={birthdays} nameFormat={s.birthdayNameFormat} />
        ) : (
          empty(m, <CakeIcon size={22} />, 'Doğum Günleri', 'Bugün doğum günü olan yok', 'birthday-card')
        );
      case 'bell':
        return fullHoliday ? null : <BellCard key={m} status={bell} />;
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
          empty(m, <CalendarIcon size={22} />, label('events'), 'Yaklaşan etkinlik yok', 'events-card')
        );
      case 'book':
        return book ? <BookCard key={m} book={book} /> : empty(m, <LibraryIcon size={22} />, label('book'), 'Bu hafta kitap seçilmedi', 'book-card');
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
      case 'duties':
        return (
          duties.length > 0 ||
          (state.dutySupervisors ?? []).some((x) => x.date === today.isoDate) ||
          (state.transportDuties ?? []).some((x) => x.date === today.isoDate && x.teacherNames.length > 0) ||
          (state.holidays ?? []).some((x) => x.date === today.isoDate)
        );
      case 'leaves':
        return leaves.length > 0;
      case 'birthdays':
        return birthdays.length > 0;
      case 'bell':
        return !fullHoliday;
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

  // Gece / hafta sonu modu: ders dışı saatlerde ekran koruyucu ya da karartma. Uzaktan "Uyut" her zaman
  // ekran koruyucuya geçirir; "Uyandır" uyku saatinde de panoyu açık tutar.
  const offDay = today.weekday >= 6 || (state.holidays ?? []).some((h) => h.date === today.isoDate);
  const scheduledSleep = !identifying && isSleepTime({ settings: s, periods, secondsOfDay: today.secondsOfDay, offDay });
  const forcedSleep = power === 'sleep' && !identifying;
  const sleeping = forcedSleep || (scheduledSleep && power !== 'wake');
  const reporter = (
    <StatusReporter
      auth={auth}
      status={{
        slideIndex: shown.index,
        slideCount: shown.count,
        slideTitle: shown.title,
        paused: remote.paused,
        sleeping,
        mode: state.emergency ? 'emergency' : display.mode,
      }}
    />
  );

  // Acil durum her şeyin önündedir: gece modu, yalnızca duyurular ve tam pano fark etmez
  if (state.emergency) {
    return (
      <Stage className={`${classes} mode-emergency`} style={themeVars} width={stageW} height={stageH}>
        {reporter}
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

  // Deneme süresi doldu: içerik gösterilmez, okul yönetimine ne yapacağı söylenir
  if (school.subscriptionEnded) {
    return (
      <Stage className="theme-dark" width={stageW} height={stageH}>
        {reporter}
        <div className="splash">
          <BrandMark size={120} className="splash-mark" />
          <div className="splash-title">{school.name}</div>
          <div className="splash-sub">Okulyayın deneme süresi sona erdi. Okul yönetimi panelden aboneliği başlatabilir.</div>
        </div>
      </Stage>
    );
  }

  if (sleeping && (s.sleepMode === 'screensaver' || forcedSleep)) {
    return (
      <Stage className={classes} style={themeVars} width={stageW} height={stageH}>
        {reporter}
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
      nav={remote.nav}
      paused={remote.paused}
      onShow={onShow}
    />
  );
  const time = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: school.timezone }).format(now);
  const overlays = (
    <>
      {remote.paused && <div className="paused-badge">Duraklatıldı</div>}
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

  // Tam ekran saat: büyük saat, tarih ve zil durumu (ör. spor salonu, konferans salonu girişi)
  if (display.mode === 'clock') {
    return (
      <Stage className={`${classes} mode-clock`} style={themeVars} width={stageW} height={stageH}>
        {reporter}
        <ClockScreen now={now} timezone={school.timezone} bell={bell} schoolName={school.name} schoolType={s.schoolType} logoUrl={school.logoUrl} />
        {overlays}
      </Stage>
    );
  }

  // Yalnızca duyurular: ek TV'ler için tam ekran slayt, köşede küçük saat
  if (display.mode === 'slides') {
    return (
      <Stage className={`${classes} mode-slides`} style={themeVars} width={stageW} height={stageH}>
        {reporter}
        {slideshow(true)}
        <div className="corner-clock">{time}</div>
        {overlays}
      </Stage>
    );
  }

  return (
    <Stage className={classes} style={themeVars} width={stageW} height={stageH}>
      {reporter}
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

/** Panonun anlık durumunu bildiren görünmez bileşen (her görünümde aynı kanca çalışsın diye) */
function StatusReporter({ auth, status }: { auth: DisplayAuth; status: Omit<ScreenLiveStatus, 'at'> }) {
  useStatusReport(auth, status);
  return null;
}
