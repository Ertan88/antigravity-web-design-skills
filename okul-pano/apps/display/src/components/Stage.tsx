import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** Görüntü izini (burn-in) önlemek için içerik birkaç dakikada bir 2-3 piksel kaydırılır. */
const SHIFTS = [
  [0, 0],
  [2, 1],
  [-1, 2],
  [-2, -1],
  [1, -2],
];

/**
 * Pano 1920x1080 sabit tuvalde tasarlanır ve her ekrana orantılı ölçeklenir:
 * 720p TV'de de 4K TV'de de aynı yerleşim, aynı okunabilirlik.
 */
export function Stage({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const [scale, setScale] = useState(1);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setShift((s) => (s + 1) % SHIFTS.length), 4 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const [dx, dy] = SHIFTS[shift]!;
  return (
    <div className="viewport">
      <div
        className={`stage ${className ?? ''}`}
        style={{
          ...style,
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale}) translate(${dx}px, ${dy}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
