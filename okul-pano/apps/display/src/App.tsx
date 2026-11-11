import { useCallback, useEffect, useState } from 'react';
import { dropPreviewParams, embedded, resolveAuth, saveDeviceToken, type DisplayAuth } from './api.ts';
import { Board } from './Board.tsx';
import { PreviewBadge } from './components/PreviewBadge.tsx';
import { Pairing } from './Pairing.tsx';

/** Fare 3 saniye kıpırdamazsa imleç gizlenir (TV'de ekranın ortasında kalmasın); oynayınca geri gelir */
function useAutoHideCursor() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => document.body.classList.add('cursor-hidden');
    const show = () => {
      document.body.classList.remove('cursor-hidden');
      clearTimeout(timer);
      timer = setTimeout(hide, 3000);
    };
    show();
    window.addEventListener('mousemove', show);
    window.addEventListener('mousedown', show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', show);
      window.removeEventListener('mousedown', show);
    };
  }, []);
}

export function App() {
  const [auth, setAuth] = useState<DisplayAuth | null>(() => resolveAuth());
  useAutoHideCursor();

  // Tam ekran önizlemenin süresi dolunca koyu bir ekranda kalınmaz: eşleştirme ekranına geçilir (bu cihaz daha önce
  // eşleştirildiyse kendi anahtarıyla panoya). Panelin içindeki küçük önizlemenin anahtarını panel yeniler.
  const leavePreview = useCallback(() => {
    dropPreviewParams();
    setAuth(resolveAuth());
  }, []);

  const onUnauthorized = useCallback(() => {
    if (auth?.preview) {
      if (!embedded) leavePreview();
      return;
    }
    // Ekran panelden silindi ya da anahtarı yenilendi: eşleştirme ekranına dön
    saveDeviceToken(null);
    setAuth(null);
  }, [auth, leavePreview]);

  const onPaired = useCallback((token: string) => {
    saveDeviceToken(token);
    setAuth({ token, preview: false });
  }, []);

  if (!auth) return <Pairing onPaired={onPaired} />;
  return (
    <>
      <Board key={auth.token} auth={auth} onUnauthorized={onUnauthorized} />
      {auth.preview && <PreviewBadge token={auth.token} onExpired={leavePreview} />}
    </>
  );
}
