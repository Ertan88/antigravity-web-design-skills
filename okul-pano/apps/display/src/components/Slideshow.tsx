import { isWithinWindow, parseYouTubeUrl, type DisplayAnnouncement } from '@okulpano/shared/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MegaphoneIcon, SchoolIcon } from './Icons.tsx';

/* ---------- YouTube IFrame API ---------- */

interface YTPlayer {
  destroy(): void;
  mute(): void;
  playVideo(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: { ENDED: number };
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

  useEffect(() => {
    const ref = parseYouTubeUrl(url);
    const end = () => endRef.current();
    if (!ref) {
      const t = setTimeout(end, 1000);
      return () => clearTimeout(t);
    }
    let player: YTPlayer | null = null;
    let cancelled = false;
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
          playerVars: {
            autoplay: 1,
            mute: sound ? 0 : 1,
            controls: 0,
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3,
            disablekb: 1,
            start: ref.start ?? 0,
            origin: location.origin,
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              if (!sound) e.target.mute();
              e.target.playVideo();
            },
            onStateChange: (e: { data: number }) => {
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
      try {
        player?.destroy();
      } catch {
        /* zaten kaldırılmış */
      }
    };
  }, [url, sound, maxSec]);

  return <div className="video-frame" ref={host} />;
}

/* ---------- Slayt gösterisi ---------- */

interface Props {
  announcements: DisplayAnnouncement[];
  now: Date;
  defaultDurationSec: number;
  videoSound: boolean;
  schoolName: string;
  logoUrl: string | null;
}

export function Slideshow({ announcements, now, defaultDurationSec, videoSound, schoolName, logoUrl }: Props) {
  // Yayın aralığı her 30 saniyede bir yeniden değerlendirilir (her saniye değil)
  const windowKey = Math.floor(now.getTime() / 30_000);
  const slides = useMemo(
    () => announcements.filter((a) => isWithinWindow(windowKey * 30_000, a.startsAt, a.endsAt)),
    [announcements, windowKey],
  );
  const [cursor, setCursor] = useState({ index: 0, round: 0 });
  const count = slides.length;
  const index = count ? cursor.index % count : 0;
  const slide = slides[index] ?? null;

  const next = useCallback(() => setCursor((c) => ({ index: count ? (c.index + 1) % count : 0, round: c.round + 1 })), [count]);

  const duration = slide ? (slide.durationSec ?? defaultDurationSec) : 0;
  useEffect(() => {
    if (!slide || slide.kind === 'video') return;
    const t = setTimeout(next, duration * 1000);
    return () => clearTimeout(t);
  }, [slide, cursor.round, duration, next]);

  // Sıradaki görseli önceden yükle: geçişte boş kare görünmesin
  useEffect(() => {
    const upcoming = slides[(index + 1) % Math.max(1, count)];
    if (upcoming?.imageUrl) new Image().src = upcoming.imageUrl;
  }, [slides, index, count]);

  if (!slide) {
    return (
      <section className="card slideshow slideshow-empty">
        {logoUrl ? <img src={logoUrl} alt="" className="welcome-logo" /> : <SchoolIcon size={140} className="welcome-icon" />}
        <div className="welcome-title">{schoolName}</div>
        <div className="welcome-sub">Hoş geldiniz</div>
      </section>
    );
  }

  const key = `${slide.id}-${cursor.round}`;
  return (
    <section className="card slideshow">
      <div className={`slide slide-${slide.kind}`} key={key}>
        {slide.kind === 'text' ? (
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
                <VideoSlide url={slide.youtubeUrl} sound={videoSound} maxSec={slide.durationSec} onEnd={next} />
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
      {slide.kind !== 'video' && (
        <div className="slide-progress" aria-hidden="true">
          <div key={key} style={{ animationDuration: `${duration}s` }} />
        </div>
      )}
    </section>
  );
}
