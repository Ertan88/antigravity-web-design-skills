import { IconFlower, IconSchool, IconSnowflake } from '@tabler/icons-react';
/**
 * Özel gün filigranları: millî bayramlarda ve 10 Kasım'da Türk bayrağı, dini bayramlarda hilal ve
 * yıldızlar, Öğretmenler Günü'nde kep, yeni yılda kar tanesi. Üst barın ortasında ve zeminde silik durur.
 * 10 Kasım'da üst barda bayrak yerine siyah yas kurdelesi ve "10 Kasım · Saygıyla anıyoruz" yazısı; zeminde bayrak kalır.
 */

/** Türk bayrağı: TS 2001 / 2893 sayılı kanundaki oranlar (en 1,5 × boy) */
function TurkishFlag() {
  return (
    <svg viewBox="0 0 150 100" aria-hidden="true">
      <rect width="150" height="100" rx="4" fill="#e30a17" />
      <circle cx="53.125" cy="50" r="25" fill="#fff" />
      <circle cx="59.375" cy="50" r="20" fill="#e30a17" />
      <polygon fill="#fff" points="72.92,50 95.53,57.35 81.55,38.11 81.55,61.89 95.53,42.65" />
    </svg>
  );
}

/** Hilal ve yıldızlar (Ramazan ve Kurban bayramları) */
function Crescent() {
  return (
    <svg viewBox="0 0 120 100" aria-hidden="true">
      <path fill="currentColor" d="M52 8a42 42 0 1 0 34 66A34 34 0 1 1 52 8z" />
      <polygon fill="currentColor" points="92,30 95.5,40.5 106.5,40.5 97.5,47 101,57.5 92,51 83,57.5 86.5,47 77.5,40.5 88.5,40.5" />
      <circle cx="108" cy="16" r="3" fill="currentColor" />
      <circle cx="74" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function GraduationCap() {
  return <IconSchool stroke={1.4} aria-hidden="true" />;
}

function Snowflake() {
  return <IconSnowflake stroke={1.3} aria-hidden="true" />;
}

/** Lale (bahar teması) */
function Tulip() {
  return <IconFlower stroke={1.4} aria-hidden="true" />;
}

const MARKS: Record<string, () => React.JSX.Element> = {
  spring: Tulip,
  national: TurkishFlag,
  ataturk: TurkishFlag,
  ramazan: Crescent,
  kurban: Crescent,
  teachers: GraduationCap,
  newyear: Snowflake,
};

/**
 * 10 Kasım yas kurdelesi: tek parça siluet (kenar çizgisi yok; kesişen kollarda iç çizgi oluşmaz). Koyu temada
 * görünür olsun diye dış hattına CSS ile ince açık bir ışık verilir.
 */
function MourningRibbon() {
  return (
    <svg className="mourning-ribbon" viewBox="0 0 100 140" aria-hidden="true">
      <defs>
        <linearGradient id="mourning-ribbon-fill" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#2b2b2b" />
          <stop offset="0.5" stopColor="#050505" />
          <stop offset="1" stopColor="#1f1f1f" />
        </linearGradient>
      </defs>
      <path
        fill="url(#mourning-ribbon-fill)"
        d="M50 6C29 6 20 27 29 49L57 132L72 120L45 53C39 37 43 24 50 24C57 24 61 37 55 53L28 120L43 132L71 49C80 27 71 6 50 6Z"
      />
    </svg>
  );
}

/** Üst barda 10 Kasım: kurdele ve yanında "10 Kasım · Saygıyla anıyoruz" */
function AtaturkHeader() {
  return (
    <div className="mourning-mark">
      <MourningRibbon />
      <div className="mourning-text">
        <strong>10 Kasım</strong>
        <span>Saygıyla anıyoruz</span>
      </div>
    </div>
  );
}

/** Üst bardaki işaret zemindekinden farklı olabilir (10 Kasım: üstte kurdele, zeminde bayrak) */
const HEADER_MARKS: Record<string, () => React.JSX.Element> = {
  ataturk: AtaturkHeader,
};

export function SpecialMark({ id, className }: { id: string; className: string }) {
  const Mark = (className.includes('header') ? HEADER_MARKS[id] : undefined) ?? MARKS[id];
  if (!Mark) return null;
  return (
    <div className={`special-mark special-mark-${id} ${className}`}>
      <Mark />
    </div>
  );
}
