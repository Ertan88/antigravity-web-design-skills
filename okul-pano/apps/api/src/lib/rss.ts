/**
 * RSS / Atom başlıkları (ör. MEB ya da il millî eğitim duyuruları): kayan yazıya eklenir.
 * Adres başına 30 dk önbellek; servis yanıt vermezse son başarılı liste, o da yoksa boş liste döner.
 */
const TTL_MS = 30 * 60 * 1000;
const MAX_ITEMS = 8;
const cache = new Map<string, { at: number; titles: string[] }>();

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** RSS <item><title> ya da Atom <entry><title> başlıklarını sırayla çıkarır */
export function parseFeedTitles(xml: string, max = MAX_ITEMS): string[] {
  const out: string[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks) {
    const m = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const title = m ? decode(m[1]!) : '';
    if (title && !out.includes(title)) out.push(title);
    if (out.length >= max) break;
  }
  return out;
}

const refreshing = new Set<string>();

/**
 * Pano verisini bekletmez: önbellekteki (gerekirse eski) başlıkları hemen döndürür, süresi dolmuşsa
 * arka planda yeniler. Yeni başlıklar panonun sonraki veri çekişinde görünür.
 */
export function feedTitlesNow(url: string): string[] {
  const hit = cache.get(url);
  if ((!hit || Date.now() - hit.at >= TTL_MS) && !refreshing.has(url)) {
    refreshing.add(url);
    void getFeedTitles(url).finally(() => refreshing.delete(url));
  }
  return hit?.titles ?? [];
}

/** Web sayfası verilmişse sayfadaki RSS bağlantısını bulur (<link rel="alternate" type="application/rss+xml">) */
export function discoverFeedUrl(html: string, base: string): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) return new URL(href, base).toString();
  }
  return null;
}

/** Google Haberler başlıkları "Başlık - Kaynak" biçimindedir; kaynak adı ayrıca gösterildiği için atılır */
export function tidyNewsTitle(title: string, url: string): string {
  return url.includes('news.google.') ? title.replace(/\s+-\s+[^-]{2,60}$/, '') : title;
}

async function fetchText(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'OkulPano/1.0 (+RSS)' } });
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}

export async function getFeedTitles(url: string): Promise<string[]> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.titles;
  try {
    let text = await fetchText(url);
    // RSS değil de web sayfasıysa sayfanın kendi RSS bağlantısı denenir
    if (!/<(rss|feed|rdf:RDF)\b/i.test(text)) {
      const feed = discoverFeedUrl(text, url);
      if (!feed) throw new Error('RSS bulunamadı');
      text = await fetchText(feed);
    }
    const titles = parseFeedTitles(text).map((t) => tidyNewsTitle(t, url));
    cache.set(url, { at: Date.now(), titles });
    return titles;
  } catch {
    // Eski liste bir süre daha kullanılır; tekrar tekrar denenmesin diye 5 dk sonra yeniden denenir
    const titles = hit?.titles ?? [];
    cache.set(url, { at: Date.now() - TTL_MS + 5 * 60 * 1000, titles });
    return titles;
  }
}
