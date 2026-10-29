import { useEffect, useState } from 'react';

/**
 * Açık / koyu tema. Seçim tarayıcıda saklanır; hiç seçilmemişse cihazın ayarı izlenir.
 * <html> etiketine "dark" sınıfı eklenir (bkz. index.css).
 */
export type Theme = 'light' | 'dark';

const KEY = 'okulpano.theme';

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export function currentTheme(): Theme {
  return stored() ?? (systemDark() ? 'dark' : 'light');
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f0e0d' : '#f7f6f3');
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    // Kullanıcı seçim yapmadıysa cihaz teması değişince uyulur
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => !stored() && setTheme(systemDark() ? 'dark' : 'light');
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, []);
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* gizli pencere: yalnızca bu oturum */
    }
    setTheme(next);
  };
  return { theme, toggle };
}
