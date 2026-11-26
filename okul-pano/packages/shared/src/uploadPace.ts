/** Yükleme aşaması: gönderim yüzdesi, ardından sunucunun dosyayı okuması */
export type UploadPhase = { phase: 'upload'; percent: number } | { phase: 'reading' };

/**
 * Gönderim yüzdesi ekranda okunabilsin: küçük dosyada gönderim bir anda biter ve yüzde görünmeden "okunuyor"a
 * geçilirdi. Görünen yüzde gerçek yüzdeyi en az `minMs` içinde yakalar (öne geçmez), %100'de `holdMs` kalır, sonra
 * okuma aşaması bildirilir. Yanıt erken gelse de `ready()` bu gösterim bitene kadar bekletir (en çok ~1,6 sn).
 */
export function pacedUpload(report: (p: UploadPhase) => void, minMs = 1200, holdMs = 400) {
  const start = Date.now();
  let actual = 0;
  let sent = false;
  let shown = -1;
  let fullAt = 0;
  let finished = false;
  let release: () => void = () => {};
  const done = new Promise<void>((r) => (release = r));
  const tick = () => {
    if (finished) return;
    const now = Date.now();
    const allowed = Math.min(actual, Math.floor(((now - start) / minMs) * 100));
    if (allowed > shown) {
      shown = allowed;
      report({ phase: 'upload', percent: shown });
      if (shown >= 100 && !fullAt) fullAt = now;
    }
    if (sent && shown >= 100 && now - fullAt >= holdMs) {
      finished = true;
      clearInterval(timer);
      report({ phase: 'reading' });
      release();
    }
  };
  const timer = setInterval(tick, 40);
  tick();
  return {
    /** Gerçek gönderim yüzdesi */
    progress(percent: number) {
      actual = Math.max(actual, Math.min(100, percent));
    },
    /** Gönderim bitti (sunucu okumaya başladı) */
    sent() {
      actual = 100;
      sent = true;
    },
    /** Gösterim bitene kadar bekler; yanıt bundan sonra işlenir */
    ready: () => done,
    /** Hata ya da iptal: zamanlayıcı durur, bekleyen yoktur */
    stop() {
      finished = true;
      clearInterval(timer);
      release();
    },
  };
}
