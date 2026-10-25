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
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </svg>
  );
}

function Snowflake() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12h20M12 2v20m-8.5-8.5L7 12 3.5 8.5M20.5 8.5 17 12l3.5 3.5M8.5 3.5 12 7l3.5-3.5M15.5 20.5 12 17l-3.5 3.5" />
      <path d="m4.93 4.93 14.14 14.14m0-14.14L4.93 19.07" />
    </svg>
  );
}

/** Lale (bahar teması) */
function Tulip() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 14c-3.3 0-5-2.6-5-6V4l2.5 2L12 3l2.5 3L17 4v4c0 3.4-1.7 6-5 6z" />
      <path d="M12 14v8" />
      <path d="M12 19c-2.5 0-4.5-1.5-5-4 2.5 0 4.5 1.5 5 4zm0-1c2.5 0 4.5-1.5 5-4-2.5 0-4.5 1.5-5 4z" />
    </svg>
  );
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
