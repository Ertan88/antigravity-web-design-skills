import { gradeHue, isWithinWindow, parseYouTubeUrl, slideSeconds, splitSchoolName, youTubeThumbnail, type DisplayAnnouncement, type ExamSlideRow } from '@okulpano/shared/client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DesignSlide } from '@okulpano/slides';
import { MegaphoneIcon, SchoolIcon } from './Icons.tsx';

/* ---------- Bugünkü sınavlar slaytı ---------- */

const EXAM_KIND: Record<ExamSlideRow['groups'][number]['kind'], string> = { written: 'Yazılı', practical: 'Uygulama', common: 'Ortak' };

/** Sığmayan slaytta yazı en çok bu kadar küçülür; daha fazlası gerekiyorsa ders saatleri sayfalara bölünür */
const MIN_EXAM_SCALE = 0.82;
const EXAM_ROW_GAP = 14;

type ExamLayout = { pages: { rows: number[]; scale: number }[] };

type ExamKindKey = ExamSlideRow['groups'][number]['kind'];

/**
 * Bir ders saatindeki sınavlar ders adına göre: ders adı bir kez, altında sınıf etiketleri. Yazılı sınav olağan
 * olandır; uygulama ya da ortak sınav ders adının yanında (hepsi aynıysa) ya da ilgili etiketin içinde belirtilir.
 */
function bySubject(groups: ExamSlideRow['groups']) {
  const out: { key: string; subject: string; groups: ExamSlideRow['groups'] }[] = [];
  for (const g of groups) {
    const key = g.subject.trim().toLocaleLowerCase('tr-TR');
    const hit = out.find((o) => o.key === key);
    if (hit) hit.groups.push(g);
    else out.push({ key, subject: g.subject, groups: [g] });
  }
  return out.map((o) => {
    const kinds = new Set(o.groups.map((g) => g.kind));
    const shared: ExamKindKey | null = kinds.size === 1 ? o.groups[0]!.kind : null;
    return { ...o, shared };
  });
}

/** Bir ders saati kartı (görünen ve ölçülen kopyada aynı) */
function ExamRow({ r }: { r: ExamSlideRow }) {
  return (
    <div className={`exam-slide-row${r.now ? ' is-now' : ''}`}>
      <div className="exam-slide-period">
        {r.periodNo}. ders
        {r.now && <span className="exam-slide-now">Şimdi</span>}
      </div>
      {bySubject(r.groups).map((s) => (
        <div key={s.key} className="exam-slide-subject">
          <div className="exam-slide-name">
            {s.subject}
            {s.shared && s.shared !== 'written' && <em>{EXAM_KIND[s.shared]}</em>}
          </div>
          <div className="exam-slide-badges">
            {s.groups.map((g) => {
              const note = [!s.shared && g.kind !== 'written' ? EXAM_KIND[g.kind] : null, g.classes].filter(Boolean).join(' · ');
              return (
                <span key={g.key} className="exam-slide-badge" style={{ '--chip-hue': gradeHue(g.label) } as CSSProperties}>
                  {g.label}
                  {note && <small>{note}</small>}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Satır yüksekliklerine göre yerleşim: hepsi sığarsa tek sayfa; biraz taşarsa küçültülür; çok taşarsa sayfalara bölünür */
function planExamLayout(heights: number[], available: number): ExamLayout {
  const all = heights.map((_, i) => i);
  const total = (ids: number[]) => ids.reduce((sum, id) => sum + heights[id]!, 0) + EXAM_ROW_GAP * Math.max(0, ids.length - 1);
  const fit = (ids: number[]) => Math.min(1, available / Math.max(1, total(ids)));
  if (!available || fit(all) >= MIN_EXAM_SCALE) return { pages: [{ rows: all, scale: fit(all) }] };
  // Sayfalara böl: her sayfaya küçültmeden sığan kadar ders saati (tek başına sığmayan saat kendi sayfasında küçülür)
  const pages: number[][] = [];
  let current: number[] = [];
  for (const id of all) {
    if (current.length && total([...current, id]) > available) {
      pages.push(current);
      current = [];
    }
    current.push(id);
  }
  if (current.length) pages.push(current);
  return { pages: pages.map((rows) => ({ rows, scale: fit(rows) })) };
}

/**
 * Panonun kendi oluşturduğu slayt: her ders saati bir kart (ders adı bir kez, altında sınıf etiketleri), şu anki sınav saati vurgulu. Satırlar görünmeyen bir
 * kopyada ölçülür; alana sığmıyorsa önce yazı küçülür (en çok %18), yetmezse sayfalara bölünür ve sayfalar slaytın
 * süresini paylaşır ("1/2", "2/2").
 */
function ExamSlide({ title, rows, durationSec }: { title: string; rows: ExamSlideRow[]; durationSec: number }) {
  const body = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ExamLayout>({ pages: [{ rows: rows.map((_, i) => i), scale: 1 }] });
  const [page, setPage] = useState(0);
  const signature = JSON.stringify(rows);

  useLayoutEffect(() => {
    const box = body.current;
    const copy = measure.current;
    if (!box || !copy) return;
    const run = () => {
      const heights = [...copy.children].map((c) => (c as HTMLElement).offsetHeight);
      const next = planExamLayout(heights, box.clientHeight);
      setLayout((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    run();
    // Yazı tipi geç yüklenirse ya da alan değişirse yeniden ölçülür
    const ro = new ResizeObserver(run);
    ro.observe(box);
    ro.observe(copy);
    return () => ro.disconnect();
  }, [signature]);

  const pages = layout.pages.length;
  useEffect(() => {
    setPage(0);
    if (pages <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), Math.max(3, durationSec / pages) * 1000);
    return () => clearInterval(t);
  }, [pages, durationSec, signature]);

  const current = layout.pages[Math.min(page, pages - 1)] ?? { rows: [], scale: 1 };
  const scale = current.scale;
  return (
    <div className="exam-slide">
      <div className="exam-slide-head">
        <div>
          <div className="exam-slide-kicker">Sınav takvimi</div>
          <h2>{title}</h2>
        </div>
        {pages > 1 && (
          <div className="exam-slide-page">
            {Math.min(page, pages - 1) + 1}/{pages}
          </div>
        )}
      </div>
      <div className="exam-slide-body" ref={body}>
        <div className="exam-slide-rows" style={scale < 1 ? { transform: `scale(${scale})`, width: `${100 / scale}%` } : undefined}>
          {current.rows.map((i) => rows[i] && <ExamRow key={rows[i].periodNo} r={rows[i]} />)}
        </div>
        {/* Ölçüm için bütün satırlar, küçültmesiz ve görünmez */}
        <div className="exam-slide-rows exam-slide-measure" ref={measure} aria-hidden="true">
          {rows.map((r) => (
            <ExamRow key={r.periodNo} r={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- YouTube IFrame API ---------- */

interface YTPlayer {
  destroy(): void;
  mute(): void;
  playVideo(): void;
  getCurrentTime(): number;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number };
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytPromise: Promise<YTNamespace> | null = null;
function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  ytPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      ytPromise = null;
      reject(new Error('YouTube yüklenemedi'));
    };
    document.head.appendChild(s);
  });
  return ytPromise;
}

function VideoSlide({ url, sound, maxSec, onEnd }: { url: string; sound: boolean; maxSec: number | null; onEnd: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const [playing, setPlaying] = useState(false);
  const thumb = parseYouTubeUrl(url);

  useEffect(() => {
    const ref = parseYouTubeUrl(url);
    const end = () => endRef.current();
    if (!ref) {
      const t = setTimeout(end, 1000);
      return () => clearTimeout(t);
    }
    let player: YTPlayer | null = null;
    let cancelled = false;
    let watch: ReturnType<typeof setInterval> | null = null;
    // Video takılırsa ya da internet yoksa pano kilitlenmesin diye üst sınır
    const cap = setTimeout(end, (maxSec ?? 900) * 1000);
    loadYouTube()
      .then((YT) => {
        if (cancelled || !host.current) return;
        const mount = document.createElement('div');
        host.current.replaceChildren(mount);
        player = new YT.Player(mount, {
          videoId: ref.id,
          width: '100%',
          height: '100%',
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            mute: sound ? 0 : 1,
            controls: 0,
            rel: 0,
            fs: 0,
            playsinline: 1,
            iv_load_policy: 3,
            cc_load_policy: 0,
            disablekb: 1,
            modestbranding: 1,
            start: ref.start ?? 0,
            origin: location.origin,
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              if (!sound) e.target.mute();
              e.target.playVideo();
            },
            onStateChange: (e: { data: number; target: YTPlayer }) => {
              // "Oynuyor" bilgisi ilk kare çizilmeden gelebilir (zayıf TV): kapak hemen kalkarsa arkada YouTube'un
              // oynat simgesi bir an görünür. Kapak, video gerçekten ilerleyince (yarım saniye) kalkar.
              if (e.data === YT.PlayerState.PLAYING && !watch) {
                const from = e.target.getCurrentTime();
                watch = setInterval(() => {
                  if (cancelled) return;
                  if (e.target.getCurrentTime() - from >= 0.5) {
                    if (watch) clearInterval(watch);
                    setPlaying(true);
                  }
                }, 200);
              }
              if (e.data === YT.PlayerState.ENDED) end();
            },
            onError: () => setTimeout(end, 1500),
          },
        });
      })
      .catch(() => setTimeout(end, 1500));
    return () => {
      cancelled = true;
      clearTimeout(cap);
      if (watch) clearInterval(watch);
      try {
        player?.destroy();
      } catch {
        /* zaten kaldırılmış */
      }
    };
  }, [url, sound, maxSec]);

  return (
    <div className="video-box">
      {/* Oynatıcı kutudan uzun tutulur: YouTube'un üstteki başlık ve alttaki logo şeritleri görünür alanın dışında kalır */}
      <div className="video-frame" ref={host} />
      {/* Video başlayana kadar kapak görseli: siyah ekran beklenmez */}
      {thumb && (
        <img
          className={`video-poster ${playing ? 'hidden' : ''}`}
          src={youTubeThumbnail(thumb.id, 'max')}
          alt=""
          // Bazı videolarda yüksek çözünürlüklü kapak yoktur; standart kapağa düşülür
          onError={(e) => {
            const fallback = youTubeThumbnail(thumb.id, 'hq');
            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
          }}
        />
      )}
    </div>
  );
}

/* ---------- Slayt gösterisi ---------- */

interface Props {
  announcements: DisplayAnnouncement[];
  now: Date;
  defaultDurationSec: number;
  /** Okulun üst sınırı: süresi girilmemiş duyuru metin uzunluğuna göre en çok bu kadar kalır */
  maxDurationSec?: number;
  videoSound: boolean;
  schoolName: string;
  schoolType?: string;
  logoUrl: string | null;
  /** Yalnızca duyuru gösteren panoda tam ekran (kenarlıksız) */
  full?: boolean;
  /** Uzaktan kumanda: her "sonraki / önceki" komutunda `seq` artar */
  nav?: { seq: number; step: 1 | -1 };
  /** Uzaktan kumanda: gösterilen slaytta kal */
  paused?: boolean;
  /** Gösterilen slayt değişince (mobil uzaktan kumandada "şu an gösterilen") */
  onShow?: (s: { index: number; count: number; title: string | null }) => void;
}

export function Slideshow({ announcements, now, defaultDurationSec, maxDurationSec = 60, videoSound, schoolName, schoolType, logoUrl, full = false, nav, paused = false, onShow }: Props) {
  // Yayın aralığı her 30 saniyede bir yeniden değerlendirilir (her saniye değil)
  const windowKey = Math.floor(now.getTime() / 30_000);
  const slides = useMemo(
    () => announcements.filter((a) => isWithinWindow(windowKey * 30_000, a.startsAt, a.endsAt)),
    [announcements, windowKey],
  );
  const [cursor, setCursor] = useState({ index: 0, round: 0 });
  const count = slides.length;

  // Duyurular eklenince, sırası ya da içeriği değişince gösteri listenin başından yeniden başlar:
  // panelde en üstteki (yeni ya da güncellenen) duyuru beklemeden ekrana gelir.
  const signature = slides.map((s) => [s.id, s.title, s.body, s.imageUrl, s.youtubeUrl, s.durationSec].join('|')).join('§');
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    setCursor((c) => ({ index: 0, round: c.round + 1 }));
  }, [signature]);

  // Video varsa YouTube kitaplığı baştan yüklenir; sırası gelince video hemen başlar
  const hasVideo = slides.some((s) => s.kind === 'video');
  useEffect(() => {
    if (hasVideo) loadYouTube().catch(() => undefined);
  }, [hasVideo]);
  const index = count ? cursor.index % count : 0;
  const slide = slides[index] ?? null;

  const next = useCallback(() => setCursor((c) => ({ index: count ? (c.index + 1) % count : 0, round: c.round + 1 })), [count]);

  // Uzaktan "sonraki / önceki": komut her geldiğinde bir adım
  const navSeq = useRef(nav?.seq ?? 0);
  useEffect(() => {
    if (!nav || nav.seq === navSeq.current) return;
    navSeq.current = nav.seq;
    setCursor((c) => ({ index: count ? (((c.index % count) + nav.step) % count + count) % count : 0, round: c.round + 1 }));
  }, [nav, count]);

  const showRef = useRef(onShow);
  showRef.current = onShow;
  const shownTitle = slides[index]?.title ?? null;
  useEffect(() => {
    showRef.current?.({ index, count, title: shownTitle });
  }, [index, count, shownTitle]);

  // Süresi girilmemiş metin, görsel ve tasarım duyurusu metnin uzunluğuna göre kalır (okuma süresi, üst sınıra kadar)
  const duration = !slide ? 0 : slide.kind === 'exams' ? (slide.durationSec ?? defaultDurationSec) : slideSeconds(slide, defaultDurationSec, maxDurationSec);
  // Zamanlayıcı slaytın kimliğine bağlıdır: liste her saniye yeniden kurulsa da (ör. başarı slaytları)
  // geri sayım sıfırlanmaz, slayt süresi dolunca sıradakine geçilir
  const slideId = slide?.id ?? null;
  const isVideo = slide?.kind === 'video';
  // Tek duyuru varsa geçilecek başka slayt yoktur: süre sayılmaz, ilerleme çubuğu ve geçiş efekti olmaz (duyuru
  // ekranda durur). Tek video ise bitince baştan oynar.
  const single = count <= 1;
  useEffect(() => {
    if (!slideId || isVideo || paused || single) return;
    const t = setTimeout(next, duration * 1000);
    return () => clearTimeout(t);
  }, [slideId, isVideo, cursor.round, duration, next, paused, single]);

  // Sıradaki görseli önceden yükle: geçişte boş kare görünmesin
  useEffect(() => {
    const upcoming = slides[(index + 1) % Math.max(1, count)];
    if (upcoming?.imageUrl) new Image().src = upcoming.imageUrl;
  }, [slides, index, count]);

  if (!slide) {
    const title = splitSchoolName(schoolName, schoolType);
    return (
      <section className="card slideshow slideshow-empty">
        {logoUrl ? <img src={logoUrl} alt="" className="welcome-logo" /> : <SchoolIcon size={140} className="welcome-icon" />}
        <div className="welcome-title">{title.name}</div>
        {title.type && <div className="welcome-type">{title.type}</div>}
        <div className="welcome-sub">Hoş geldiniz</div>
      </section>
    );
  }

  const key = `${slide.id}-${cursor.round}`;
  return (
    <section className={`card slideshow ${full ? 'slideshow-full' : ''}`}>
      <div className={`slide slide-${slide.kind}`} key={key}>
        {slide.kind === 'exams' ? (
          <ExamSlide title={slide.title} rows={slide.examRows ?? []} durationSec={duration} />
        ) : slide.kind === 'design' && slide.design ? (
          <div className="slide-design">
            <DesignSlide design={slide.design} schoolName={schoolName} schoolType={schoolType} logoUrl={logoUrl} />
          </div>
        ) : slide.kind === 'text' || slide.kind === 'design' ? (
          <div className="slide-text">
            <MegaphoneIcon size={72} className="slide-text-icon" />
            <h2>{slide.title}</h2>
            {slide.body && <p>{slide.body}</p>}
          </div>
        ) : (
          <>
            <div className="slide-media">
              {slide.kind === 'image' && slide.imageUrl && (
                <>
                  <div className="slide-media-bg" style={{ backgroundImage: `url("${slide.imageUrl}")` }} />
                  <img className="slide-img" src={slide.imageUrl} alt="" />
                </>
              )}
              {slide.kind === 'video' && slide.youtubeUrl && (
                <VideoSlide url={slide.youtubeUrl} sound={videoSound} maxSec={slide.durationSec} onEnd={paused ? () => undefined : next} />
              )}
            </div>
            <div className="slide-caption">
              <h2>{slide.title}</h2>
              {slide.body && <p>{slide.body}</p>}
            </div>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="slide-dots" aria-hidden="true">
          {slides.map((s, i) => (
            <span key={s.id} className={i === index ? 'active' : ''} />
          ))}
        </div>
      )}
    </section>
  );
}
