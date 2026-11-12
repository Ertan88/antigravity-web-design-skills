/*
 * Okul Yayın Pano: çevrimdışı kopya (service worker).
 *
 * Panonun sayfası, kodları, yazı tipleri ve duyuru görselleri cihazda saklanır. İnternet koptuğunda, okul ağı
 * araya girdiğinde ya da sunucu yeniden başlarken pano bu kopyadan açılır ve son kaydettiği veriyle çalışır.
 * - Sayfa (gezinme): önce ağ (en çok 8 saniye), olmazsa saklanan kopya. Sunucu güncellenince yeni sürüm ağdan gelir.
 * - Kod ve stil dosyaları (/display/assets/, adları içerik özetli, değişmez): önce saklanan kopya.
 * - Duyuru görselleri (/uploads/, adları rastgele, değişmez): önce saklanan kopya.
 * - Sunucu istekleri (/api/): hiç saklanmaz, her zaman ağa gider.
 */
const PAGE_CACHE = 'okulpano-page-v1';
const FILE_CACHE = 'okulpano-files-v1';
const MAX_FILES = 120;
const PAGE_TIMEOUT_MS = 8000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('okulpano-') && k !== PAGE_CACHE && k !== FILE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(page(req));
    return;
  }
  if (url.pathname.startsWith('/display/assets/') || url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/display/') || url.pathname === '/favicon.svg') {
    event.respondWith(file(req));
  }
});

/** Sayfa: önce ağ; ağ yoksa, yavaşsa ya da sunucu hata verirse saklanan kopya. Önizleme adresleri saklanmaz. */
async function page(req) {
  const cache = await caches.open(PAGE_CACHE);
  const key = new URL('/display/', self.location.origin).href;
  try {
    const res = await withTimeout(fetch(req), PAGE_TIMEOUT_MS);
    if (res.ok) {
      await cache.put(key, res.clone());
      return res;
    }
    const saved = await cache.match(key);
    return saved ?? res;
  } catch (err) {
    const saved = await cache.match(key);
    if (saved) return saved;
    throw err;
  }
}

/** Değişmeyen dosyalar: önce saklanan kopya; yoksa ağdan alınıp saklanır (en çok MAX_FILES dosya) */
async function file(req) {
  const cache = await caches.open(FILE_CACHE);
  const saved = await cache.match(req);
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    await cache.put(req, res.clone());
    void trim(cache);
  }
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_FILES; i++) await cache.delete(keys[i]);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
