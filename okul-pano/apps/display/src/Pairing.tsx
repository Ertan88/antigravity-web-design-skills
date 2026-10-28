import { useEffect, useState } from 'react';
import { pollPairing, startPairing, type PairingStart } from './api.ts';
import { BrandMark } from './components/Brand.tsx';
import { QrCode } from './components/QrCode.tsx';
import { Stage } from './components/Stage.tsx';

const ADMIN_URL = (import.meta.env.VITE_ADMIN_URL as string | undefined) ?? `${location.origin}/admin/`;

/** Telefondaki Okul Yayın uygulamasının açtığı eşleştirme adresi (QR ile okutulur) */
export const pairingLink = (code: string) => `okulpano://eslestir/${code}`;

/**
 * İlk kurulum ekranı: TV'de klavye gerekmez. Ekran 6 haneli kod gösterir,
 * yönetici paneline kodu girince ekran kalıcı anahtarını alır ve panoya geçer.
 */
export function Pairing({ onPaired }: { onPaired: (token: string) => void }) {
  const [pairing, setPairing] = useState<PairingStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    startPairing()
      .then((p) => !cancelled && setPairing(p))
      .catch(() => {
        if (cancelled) return;
        setError('Sunucuya ulaşılamıyor. İnternet bağlantısını kontrol edin; yeniden deneniyor…');
        setTimeout(() => setAttempt((a) => a + 1), 10_000);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(async () => {
      setNow(Date.now());
      if (Date.parse(pairing.expiresAt) < Date.now()) {
        setPairing(null);
        setAttempt((a) => a + 1);
        return;
      }
      try {
        const result = await pollPairing(pairing);
        if (result === null) {
          setPairing(null);
          setAttempt((a) => a + 1);
        } else if (result.status === 'paired') {
          clearInterval(timer);
          onPaired(result.token);
        }
      } catch {
        /* geçici ağ hatası: bir sonraki turda tekrar */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [pairing, onPaired]);

  const remaining = pairing ? Math.max(0, Math.floor((Date.parse(pairing.expiresAt) - now) / 1000)) : 0;

  return (
    <Stage className="theme-dark">
      <div className="pairing">
        <BrandMark size={96} className="pairing-icon" />
        <h1>Bu ekranı okulunuza bağlayın</h1>
        {pairing ? (
          <>
            <div className="pairing-code" aria-label={`Eşleştirme kodu ${pairing.code.split('').join(' ')}`}>
              {pairing.code.split('').map((ch, i) => (
                <span key={i} className={i === 3 ? 'gap' : ''}>
                  {ch}
                </span>
              ))}
            </div>
            <div className="pairing-ways">
              <div className="pairing-qr">
                <QrCode value={pairingLink(pairing.code)} size={260} label="Eşleştirme QR kodu" />
                <span>Okul Yayın uygulamasında Panolar › QR ile bağla</span>
              </div>
              <ol className="pairing-steps">
                <li>
                  Yönetim panelini açın: <strong>{ADMIN_URL.replace(/^https?:\/\//, '')}</strong>
                </li>
                <li>
                  <strong>Ekranlar → Ekran Ekle</strong> bölümüne gelin
                </li>
                <li>Yukarıdaki kodu girin; ekran kendiliğinden açılacak</li>
              </ol>
            </div>
            <div className="pairing-expiry">
              Kod {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} sonra yenilenecek
            </div>
          </>
        ) : (
          <div className="pairing-wait">{error ?? 'Kod alınıyor…'}</div>
        )}
      </div>
    </Stage>
  );
}
