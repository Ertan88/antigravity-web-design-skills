import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { MegaphoneIcon } from './Icons.tsx';

/**
 * Kayan yazı: sabit hızda (piksel/saniye) akar; metin kısa da olsa uzun da olsa okuma hızı aynıdır.
 * İki özdeş kopya yan yana dizilir ve %50 kaydırılır, böylece döngü dikişsizdir.
 */
/** Kayan yazı öğesi: okulun metni ya da etiketli ek kaynak (hava uyarısı, bugün tarihte, günün sözü, RSS) */
export type TickerEntry = string | { text: string; kind: 'weather' | 'history' | 'quote' | 'rss'; tag: string };

const textOf = (e: TickerEntry) => (typeof e === 'string' ? e : `${e.tag}${e.text}`);

function Item({ entry }: { entry: TickerEntry }) {
  if (typeof entry === 'string') return <span className="ticker-item">{entry}</span>;
  return (
    <span className={`ticker-item ticker-${entry.kind}`}>
      <span className="ticker-tag">{entry.tag}</span>
      <span className="ticker-text">{entry.text}</span>
    </span>
  );
}

export function Ticker({ items, speed }: { items: TickerEntry[]; speed: number }) {
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
          {items.map((entry, i) => (
            <Item key={`${r}-${i}`} entry={entry} />
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
          {items.map((entry, i) => (
            <Item key={i} entry={entry} />
          ))}
        </div>
        <div
          className="ticker-track"
          key={`${items.map(textOf).join('|')}-${reps}`}
          style={{ animationDuration: `${Math.max(10, copyWidth / speed)}s` }}
        >
          {copy(false)}
          {copy(true)}
        </div>
      </div>
    </footer>
  );
}
