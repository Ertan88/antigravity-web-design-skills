import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { MegaphoneIcon } from './Icons.tsx';

/**
 * Kayan yazı: sabit hızda (piksel/saniye) akar; metin kısa da olsa uzun da olsa okuma hızı aynıdır.
 * İki özdeş kopya yan yana dizilir ve %50 kaydırılır, böylece döngü dikişsizdir.
 */
export function Ticker({ items, speed }: { items: string[]; speed: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [reps, setReps] = useState(1);
  const [copyWidth, setCopyWidth] = useState(0);

  useLayoutEffect(() => {
    const single = probe.current?.scrollWidth ?? 0;
    const available = viewport.current?.clientWidth ?? 0;
    if (!single) return;
    const r = Math.max(1, Math.ceil(available / single));
    setReps(r);
    setCopyWidth(single * r);
  }, [items]);

  const copy = (hidden: boolean) => (
    <div className="ticker-copy" aria-hidden={hidden || undefined}>
      {Array.from({ length: reps }, (_, r) => (
        <Fragment key={r}>
          {items.map((text, i) => (
            <span className="ticker-item" key={`${r}-${i}`}>
              {text}
            </span>
          ))}
        </Fragment>
      ))}
    </div>
  );

  return (
    <footer className="footer">
      <div className="ticker-label">
        <MegaphoneIcon size={26} />
        Bilgi
      </div>
      <div className="ticker" ref={viewport}>
        <div className="ticker-probe" ref={probe} aria-hidden="true">
          {items.map((text, i) => (
            <span className="ticker-item" key={i}>
              {text}
            </span>
          ))}
        </div>
        <div
          className="ticker-track"
          key={`${items.join('|')}-${reps}`}
          style={{ animationDuration: `${Math.max(10, copyWidth / speed)}s` }}
        >
          {copy(false)}
          {copy(true)}
        </div>
      </div>
    </footer>
  );
}
