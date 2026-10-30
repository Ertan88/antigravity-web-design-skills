/** Okulyayın logosu: canlı yayın işaretli pano (yan sütun, oynat simgeli duyuru alanı, köşede canlı noktası) */
export function BrandMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#0E5E66" />
      <rect x="9" y="16" width="46" height="30" rx="7" fill="none" stroke="#FFFFFF" strokeWidth="3.5" />
      <rect x="15" y="22" width="7" height="18" rx="2" fill="#FFFFFF" />
      <rect x="25" y="22" width="24" height="18" rx="2.5" fill="#FFFFFF" />
      <path d="M34 26.5 L41.5 31 L34 35.5 Z" fill="#0E5E66" />
      <circle cx="52" cy="15" r="5.5" fill="#F5B83D" stroke="#0E5E66" strokeWidth="3" />
      <rect x="25" y="50" width="14" height="3.5" rx="1.75" fill="#FFFFFF" />
    </svg>
  );
}

/** Yazı logosu: "okul" + vurgulu "yayın" */
export function BrandName({ className }: { className?: string }) {
  return (
    <span className={className}>
      okul<span className="brand-accent">yayın</span>
    </span>
  );
}
