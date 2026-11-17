/**
 * Uygulama dışarıdan bir adresle açılınca (bildirime dokunma, bağlantı) gidilecek ekran. Android, Firebase bildirimine
 * dokunulunca uygulamayı boş bir adresle ("okulpano:///") açabilir: bu ve tanınmayan adresler ana sayfaya gider.
 * Bildirimin götüreceği ekranı _layout.tsx'teki dinleyici açar (gerekirse önce bildirimin hesabına geçer).
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const raw = (path ?? '').trim();
    if (!raw) return '/';
    // "okulpano:///onaylar" → "/onaylar"; "okulpano:///" → "/"
    const p = raw.replace(/^okulpano:\/*/i, '/').replace(/^\/{2,}/, '/');
    return p === '' ? '/' : p;
  } catch {
    return '/';
  }
}
