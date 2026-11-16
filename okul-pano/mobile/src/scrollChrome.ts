import { useEffect, useState } from 'react';

/**
 * Kaydırma yönüne göre alt menü ve "+" düğmesi: içerik aşağı inerken (kullanıcı aşağı okurken) gizlenir/küçülür,
 * yukarı kaydırınca ve sayfanın başına dönünce geri gelir. Screen kaydırmayı bildirir; alt menü ve AddFab dinler.
 */
let hidden = false;
let lastY = 0;
const listeners = new Set<(v: boolean) => void>();

function set(v: boolean) {
  if (v === hidden) return;
  hidden = v;
  listeners.forEach((l) => l(v));
}

/** Screen her kaydırmada çağırır */
export function reportScroll(y: number) {
  const dy = y - lastY;
  lastY = y;
  if (y < 24) set(false);
  else if (dy > 6) set(true);
  else if (dy < -6) set(false);
}

/** Yeni ekran açılınca alt menü yeniden görünür */
export function resetScrollChrome() {
  lastY = 0;
  set(false);
}

export function useChromeHidden(): boolean {
  const [v, setV] = useState(hidden);
  useEffect(() => {
    listeners.add(setV);
    setV(hidden);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}
