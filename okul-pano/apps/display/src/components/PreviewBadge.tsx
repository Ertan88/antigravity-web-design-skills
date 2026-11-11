import { useEffect, useState } from 'react';

/** Önizleme anahtarının bitiş zamanı (JWT'deki exp); okunamazsa null */
function expiresAt(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Paneldeki "Tam ekran aç" ile açılan önizleme: kısa ömürlüdür (30 dk) ve TV için değildir. Üstte kalan süreyi
 * ve "TV için panoyu eşleştirin" uyarısını gösteren bir rozet durur; süre dolunca eşleştirme ekranına geçilir.
 * Panelin içindeki küçük önizlemede (iframe) rozet görünmez; panel anahtarı kendisi yeniler.
 */
export function PreviewBadge({ token, onExpired }: { token: string; onExpired: () => void }) {
  const until = expiresAt(token);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const embedded = window.self !== window.top;
  const left = until ? Math.max(0, Math.ceil((until - now) / 60_000)) : null;
  const expired = left === 0;
  // Tam ekranda süre dolunca eşleştirme ekranına geçilir (App)
  useEffect(() => {
    if (expired && !embedded) onExpired();
  }, [expired, embedded, onExpired]);
  if (left === null) return null;
  const displayUrl = `${location.origin}${location.pathname}`;
  if (left <= 0) {
    return (
      <div className="preview-expired" role="alert">
        <div className="preview-expired-box">
          <div className="preview-expired-title">Önizleme süresi doldu</div>
          <p>Bu bağlantı yalnızca panelden kısa süreli önizleme içindir; pano artık güncellenmiyor.</p>
          <p>
            TV için tarayıcıda <b>{displayUrl}</b> adresini açın ve ekrandaki kodla panoyu eşleştirin
            (Panolar → Pano ekle → Kodla eşleştir).
          </p>
        </div>
      </div>
    );
  }
  if (embedded) return null;
  return (
    <div className="preview-badge" role="status">
      ÖNİZLEME · {left} dk geçerli · TV için panoyu eşleştirin
    </div>
  );
}
