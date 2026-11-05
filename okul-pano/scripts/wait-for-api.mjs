// Geliştirmede panel ve pano sunucuları API hazır olunca başlar; böylece açık tarayıcı sekmesinin
// ilk istekleri "ECONNREFUSED" hatası vermez. API 60 sn içinde açılmazsa yine de devam edilir.
const url = process.env.API_HEALTH_URL ?? 'http://localhost:3000/api/health';
const until = Date.now() + 60_000;
while (Date.now() < until) {
  try {
    if ((await fetch(url)).ok) process.exit(0);
  } catch {
    /* henüz açılmadı */
  }
  await new Promise((r) => setTimeout(r, 300));
}
console.warn('API yanıt vermedi; yine de başlatılıyor.');
