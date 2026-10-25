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

export async function getFeedTitles(url: string): Promise<string[]> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.titles;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'OkulPano/1.0 (+RSS)' } });
    if (!res.ok) throw new Error(String(res.status));
    const titles = parseFeedTitles(await res.text());
    cache.set(url, { at: Date.now(), titles });
    return titles;
  } catch {
    // Eski liste bir süre daha kullanılır; tekrar tekrar denenmesin diye 5 dk sonra yeniden denenir
    const titles = hit?.titles ?? [];
    cache.set(url, { at: Date.now() - TTL_MS + 5 * 60 * 1000, titles });
    return titles;
  }
}
