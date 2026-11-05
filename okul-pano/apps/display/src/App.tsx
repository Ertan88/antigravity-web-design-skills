import { useCallback, useState } from 'react';
import { resolveAuth, saveDeviceToken, type DisplayAuth } from './api.ts';
import { Board } from './Board.tsx';
import { Pairing } from './Pairing.tsx';

export function App() {
  const [auth, setAuth] = useState<DisplayAuth | null>(() => resolveAuth());

  const onUnauthorized = useCallback(() => {
    if (auth?.preview) return;
    // Ekran panelden silindi ya da anahtarı yenilendi: eşleştirme ekranına dön
    saveDeviceToken(null);
    setAuth(null);
  }, [auth]);

  const onPaired = useCallback((token: string) => {
    saveDeviceToken(token);
    setAuth({ token, preview: false });
  }, []);

  if (!auth) return <Pairing onPaired={onPaired} />;
  return <Board key={auth.token} auth={auth} onUnauthorized={onUnauthorized} />;
}
