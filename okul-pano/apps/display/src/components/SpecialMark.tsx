import { IconFlower, IconSchool, IconSnowflake } from '@tabler/icons-react';
/**
 * Özel gün filigranları: millî bayramlarda ve 10 Kasım'da Türk bayrağı, dini bayramlarda hilal ve
 * yıldızlar, Öğretmenler Günü'nde kep, yeni yılda kar tanesi. Üst barın ortasında ve zeminde silik durur.
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

export function SpecialMark({ id, className }: { id: string; className: string }) {
  const Mark = MARKS[id];
  if (!Mark) return null;
  return (
    <div className={`special-mark special-mark-${id} ${className}`}>
      <Mark />
    </div>
  );
}
