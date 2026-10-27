/** Panokul logosu: pano düzeni (sol sütun, duyuru alanı, sağ sütun) */
export function BrandMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#0E5E66" />
      <rect x="9" y="13" width="46" height="32" rx="7" fill="none" stroke="#FFFFFF" strokeWidth="3.5" />
      <rect x="15" y="19" width="7" height="20" rx="2" fill="#FFFFFF" />
      <rect x="25" y="19" width="14" height="20" rx="2.5" fill="#F5B83D" />
      <rect x="42" y="19" width="7" height="20" rx="2" fill="#FFFFFF" />
      <rect x="25" y="49" width="14" height="3.5" rx="1.75" fill="#FFFFFF" />
    </svg>
  );
}

/** Yazı logosu: "pan·o·kul", ortak "o" vurgulu */
export function BrandName({ className }: { className?: string }) {
  return (
    <span className={className}>
      pan<span className="brand-o">o</span>kul
    </span>
  );
}
