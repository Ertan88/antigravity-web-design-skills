import {
  DESIGN_PALETTES,
  designTemplate,
  splitSchoolName,
  type AnnouncementDesign,
  type DesignField,
  type DesignIcon,
} from '@okulpano/shared/client';
import { IconBus, IconCalendar, IconClock, IconFlag, IconMapPin, IconPencil, IconSpeakerphone, IconStar, IconTrophy, IconUsers, type Icon } from '@tabler/icons-react';
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';

/* Simgeler: Tabler Icons (MIT), panel, pano ve mobil uygulamayla aynı set; SVG olduğu için emoji fontu gerekmez */
const ICONS: Record<DesignIcon, Icon> = {
  users: IconUsers,
  bus: IconBus,
  trophy: IconTrophy,
  calendar: IconCalendar,
  pencil: IconPencil,
  megaphone: IconSpeakerphone,
  flag: IconFlag,
  clock: IconClock,
  pin: IconMapPin,
  star: IconStar,
};

export function DesignIconSvg({ icon, className, strokeWidth = 1.8 }: { icon: DesignIcon; className?: string; strokeWidth?: number }) {
  const C = ICONS[icon];
  return <C className={className} stroke={strokeWidth} aria-hidden="true" />;
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
  // Fotoğraf: örnek görünümde yoktur; yalnızca yüklenmişse simgenin yerine geçer
  const photo = t.photo ? design.fields[t.photo.key]?.trim() || '' : '';
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
          {t.layout === 'center' &&
            (photo ? (
              <span className="ds-photo ds-photo-center">
                <img src={photo} alt="" />
              </span>
            ) : (
              <DesignIconSvg icon={t.icon} className="ds-center-icon" strokeWidth={1.5} />
            ))}
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
            {photo ? <img src={photo} alt="" className="ds-art-photo" /> : <DesignIconSvg icon={t.icon} className="ds-art-icon" strokeWidth={1.4} />}
          </div>
        )}
      </div>

      {school && (
        <div className="ds-school">
          {logoUrl && <img src={logoUrl} alt="" className="ds-school-logo" />}
          {/* Panonun üst barındaki gibi: kalın okul adı, altında okul türü */}
          <span className="ds-school-text">
            <span className="ds-school-name">{school.name}</span>
            {school.type && <span className="ds-school-type">{school.type}</span>}
          </span>
        </div>
      )}
    </div>
  );
}
