import {
  DESIGN_PALETTES,
  designTemplate,
  splitSchoolName,
  type AnnouncementDesign,
  type DesignField,
  type DesignIcon,
} from '@okulpano/shared/client';
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';

/* Çizgi simgeler (lucide ile aynı 24'lük ızgara): emoji fontu olmayan cihazlarda da aynı görünür */
const ICONS: Record<DesignIcon, ReactNode> = {
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  bus: (
    <>
      <path d="M8 6v6" />
      <path d="M15 6v6" />
      <path d="M2 12h19.6" />
      <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
      <circle cx="7" cy="18" r="2" />
      <path d="M9 18h5" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),
  trophy: (
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </>
  ),
  calendar: (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  pencil: (
    <>
      <path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" />
      <path d="m15 5 4 4" />
    </>
  ),
  megaphone: (
    <>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
  flag: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  star: <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z" />,
};

export function DesignIconSvg({ icon, className, strokeWidth = 1.8 }: { icon: DesignIcon; className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[icon]}
    </svg>
  );
}

/** Uzun başlıklar küçülür: koridordan okunurken taşma olmasın */
function sizeClass(text: string) {
  if (text.length > 48) return 'ds-long';
  if (text.length > 28) return 'ds-mid';
  return '';
}

/** Konfeti: tebrik ve kutlama şablonlarında sabit yerleşimli renkli parçalar */
const CONFETTI = [
  [6, 12, 20], [14, 70, -30], [22, 30, 45], [30, 86, 10], [70, 14, -15], [78, 74, 35], [86, 34, -40], [92, 88, 20], [48, 8, 60], [62, 80, -20],
  [10, 44, 15], [90, 56, -10],
] as const;

/**
 * Metin uzunsa slayt bütün ölçüleriyle birlikte küçülür (--fit): içerik kutuya sığana kadar
 * adım adım. Kutu boyutu değişince (panel önizlemesi, dikey pano) yeniden hesaplanır.
 */
function useFitContent(root: RefObject<HTMLDivElement | null>, key: string) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const fit = () => {
      const content = el.querySelector<HTMLElement>('.ds-content');
      if (!content) return;
      let f = 1;
      el.style.setProperty('--fit', '1');
      while (f > 0.45 && content.scrollHeight > content.clientHeight + 1) {
        f -= 0.05;
        el.style.setProperty('--fit', f.toFixed(2));
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [root, key]);
}

interface Props {
  design: AnnouncementDesign;
  schoolName?: string;
  schoolType?: string;
  /** Okul logosu: altta okul adının yanında */
  logoUrl?: string | null;
  /** Boş alanlarda örnek metni göster (paneldeki şablon seçicisi için) */
  sample?: boolean;
}

/**
 * Hazır şablonlu duyuru slaytı. Bütün ölçüler kutunun boyutuna göredir (container query):
 * panoda tam boy, panelde küçük önizleme olarak aynı görünür; dikey panoda alt alta dizilir.
 */
export function DesignSlide({ design, schoolName, schoolType, logoUrl, sample = false }: Props) {
  const t = designTemplate(design.template);
  const p = DESIGN_PALETTES[design.palette] ?? DESIGN_PALETTES[t.palette];
  const val = (f: DesignField | undefined) => (f ? design.fields[f.key]?.trim() || (sample ? f.placeholder : '') : '');
  const headline = val(t.headline) || t.name;
  const subline = val(t.subline);
  const info = t.info.map((f) => ({ f, v: val(f) })).filter((x) => x.v);
  const note = val(t.note);
  const school = schoolName ? splitSchoolName(schoolName, schoolType) : null;
  const style = { '--ds-from': p.from, '--ds-to': p.to, '--ds-accent': p.accent } as CSSProperties;
  const root = useRef<HTMLDivElement>(null);
  useFitContent(root, JSON.stringify(design.fields) + design.template + (logoUrl ?? '') + (schoolName ?? ''));

  return (
    <div ref={root} className={`ds ds-${t.layout} ds-t-${t.id}`} style={style}>
      <div className="ds-bg" aria-hidden="true">
        <span className="ds-orb ds-orb-1" />
        <span className="ds-orb ds-orb-2" />
        <span className="ds-dots" />
        {t.layout === 'center' &&
          CONFETTI.map(([x, y, r], i) => <span key={i} className={`ds-confetti ds-confetti-${i % 3}`} style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${r}deg)` }} />)}
      </div>

      <div className="ds-content">
        <div className="ds-text">
          {t.layout === 'center' && <DesignIconSvg icon={t.icon} className="ds-center-icon" strokeWidth={1.5} />}
          <span className="ds-kicker">{t.kicker}</span>
          <h2 className={`ds-headline ${sizeClass(headline)}`}>{headline}</h2>
          {subline && <div className="ds-subline">{subline}</div>}
          {info.length > 0 && (
            <ul className="ds-info">
              {info.map(({ f, v }) => (
                <li key={f.key}>
                  <span className="ds-info-icon">
                    <DesignIconSvg icon={f.icon ?? 'star'} />
                  </span>
                  <span className="ds-info-text">
                    <span className="ds-info-label">{f.label}</span>
                    <span className="ds-info-value">{v}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {note && <p className="ds-note">{note}</p>}
        </div>
        {t.layout === 'split' && (
          <div className="ds-art" aria-hidden="true">
            <span className="ds-art-ring" />
            <DesignIconSvg icon={t.icon} className="ds-art-icon" strokeWidth={1.4} />
          </div>
        )}
      </div>

      {school && (
        <div className="ds-school">
          {logoUrl && <img src={logoUrl} alt="" className="ds-school-logo" />}
          <span className="ds-school-name">
            {school.name}
            {school.type && <span> {school.type}</span>}
          </span>
        </div>
      )}
    </div>
  );
}
