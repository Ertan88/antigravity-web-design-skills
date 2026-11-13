import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { MegaphoneIcon } from './Icons.tsx';

/** Kayan yazı: sabit hızda (piksel/saniye) akar; metin kısa da olsa uzun da olsa okuma hızı aynıdır. */
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

/**
 * Kayan yazı öğe öğe akar: her öğe (duyuru, hava uyarısı, söz…) kendi kısa katmanında sağdan girer, soldan çıkar; bir
 * öğenin sonu ekrana girince sıradaki başlar. Eskiden bütün metin yan yana dizilmiş tek ve çok uzun bir şerit olarak
 * kayıyordu; ek bilgiler açıkken şerit binlerce piksel olunca TV'nin ekran kartı onu parça parça çiziyor, her yeni
 * parçada yazı bir an takılıyordu. Ekranda her an yalnızca görünen birkaç kısa parça bulunur.
 */
export function Ticker({ items, speed }: { items: TickerEntry[]; speed: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const signature = items.map(textOf).join('|');
  const [runs, setRuns] = useState<{ key: number; idx: number }[]>([]);
  const seq = useRef(0);
  const nextIdx = useRef(0);
  const count = useRef(items.length);
  count.current = items.length;

  // Metin değişince baştan başlar; yazı tipi yüklenmeden ölçülürse genişlik yanlış çıkar, beklenir
  useEffect(() => {
    let alive = true;
    setRuns([]);
    nextIdx.current = 0;
    const begin = () => {
      if (!alive) return;
      nextIdx.current = 1 % Math.max(1, count.current);
      setRuns([{ key: seq.current++, idx: 0 }]);
    };
    const ready = document.fonts?.ready;
    if (ready) void ready.then(begin, begin);
    else begin();
    return () => {
      alive = false;
    };
  }, [signature]);

  const spawn = useCallback(() => {
    const idx = nextIdx.current % Math.max(1, count.current);
    nextIdx.current = idx + 1;
    setRuns((r) => [...r, { key: seq.current++, idx }]);
  }, []);
  const finish = useCallback((key: number) => setRuns((r) => r.filter((x) => x.key !== key)), []);

  return (
    <footer className="footer">
      <div className="ticker-label">
        <MegaphoneIcon size={26} />
        Bilgi
      </div>
      <div className="ticker" ref={viewport}>
        {runs.map((r) =>
          items[r.idx] ? <Runner key={r.key} entry={items[r.idx]!} speed={speed} viewport={viewport} onClear={spawn} onDone={() => finish(r.key)} /> : null,
        )}
      </div>
    </footer>
  );
}

/** Tek öğe: kendi katmanında sağ kenardan sol kenara sabit hızla geçer (ekran kartında, Web Animations) */
function Runner({
  entry,
  speed,
  viewport,
  onClear,
  onDone,
}: {
  entry: TickerEntry;
  speed: number;
  viewport: RefObject<HTMLDivElement | null>;
  onClear: () => void;
  onDone: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const cb = useRef({ onClear, onDone });
  cb.current = { onClear, onDone };
  useLayoutEffect(() => {
    const node = el.current;
    const box = viewport.current;
    if (!node || !box) return;
    const W = box.clientWidth;
    const w = Math.max(1, node.offsetWidth);
    const v = Math.max(10, speed);
    const anim = node.animate([{ transform: `translate3d(${W}px,0,0)` }, { transform: `translate3d(${-w}px,0,0)` }], {
      duration: ((W + w) / v) * 1000,
      easing: 'linear',
      fill: 'both',
    });
    // Öğenin sonu sağ kenardan girince sıradaki başlar (aralık öğenin kendi boşluğu ve ayıracı)
    const t = setTimeout(() => cb.current.onClear(), (w / v) * 1000);
    anim.onfinish = () => cb.current.onDone();
    return () => {
      clearTimeout(t);
      anim.cancel();
    };
  }, [speed, viewport]);
  return (
    <div className="ticker-run" ref={el}>
      <Item entry={entry} />
    </div>
  );
}
