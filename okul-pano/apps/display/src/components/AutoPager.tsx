import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Props<T> = {
  items: T[];
  intervalMs?: number;
  keyOf: (item: T) => string;
  render: (item: T) => ReactNode;
  empty?: ReactNode;
} & (
  | {
      /** Satır düzeni: sayfa kapasitesi alanın yüksekliğine göre otomatik hesaplanır */
      layout?: 'rows';
      rowHeight: number;
    }
  | {
      /** Çip düzeni: isimler yan yana akar, sayfa başına sabit sayıda öğe gösterilir */
      layout: 'chips';
      pageSize: number;
    }
);

/**
 * Liste alana sığmazsa sayfalara bölünür ve belirli aralıklarla döner.
 * Kayan liste yerine sayfalama: koridordan geçerken okunması çok daha kolay.
 */
export function AutoPager<T>(props: Props<T>) {
  const { items, intervalMs = 8000, keyOf, render, empty } = props;
  const chips = props.layout === 'chips';
  const rowHeight = chips ? 0 : props.rowHeight;
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(1);
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || chips) return;
    const measure = () => setMeasured(Math.max(1, Math.floor(el.clientHeight / rowHeight)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowHeight, chips]);

  const capacity = chips ? props.pageSize : measured;
  const pages = Math.max(1, Math.ceil(items.length / capacity));

  useEffect(() => {
    setPage((p) => (p >= pages ? 0 : p));
    if (pages <= 1) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), intervalMs);
    return () => clearInterval(timer);
  }, [pages, intervalMs]);

  const current = items.slice(page * capacity, page * capacity + capacity);

  return (
    <div className={`pager ${chips ? 'pager-chips' : ''}`}>
      <div className="pager-body" ref={ref}>
        {items.length === 0 ? (
          <div className="pager-empty">{empty}</div>
        ) : (
          <div className="pager-page" key={`${page}-${capacity}`}>
            {current.map((item) =>
              chips ? (
                <div key={keyOf(item)} className="pager-chip">
                  {render(item)}
                </div>
              ) : (
                <div key={keyOf(item)} style={{ height: rowHeight }} className="pager-row">
                  {render(item)}
                </div>
              ),
            )}
          </div>
        )}
      </div>
      {pages > 1 && (
        <div className="pager-dots" aria-hidden="true">
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={i === page ? 'active' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}
