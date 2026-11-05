import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** Kare QR kodu (SVG): koyu modüller tek bir path olarak çizilir, kenarda okunabilirlik için sessiz alan bırakılır */
export function QrCode({ value, size = 280, label }: { value: string; size?: number; label: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { path: d, count: n + 4 };
  }, [value]);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      style={{ background: '#fff', borderRadius: 18 }}
    >
      <path d={path} fill="#0f172a" />
    </svg>
  );
}
