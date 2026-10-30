export interface YouTubeRef {
  id: string;
  /** Başlangıç saniyesi (?t= ya da ?start=) */
  start?: number;
}

const ID = /^[A-Za-z0-9_-]{11}$/;

function parseStart(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!m || !m[0]) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** youtu.be, watch?v=, /embed/, /shorts/ ve /live/ biçimlerindeki bağlantıları çözer. */
export function parseYouTubeUrl(input: string): YouTubeRef | null {
  const raw = input.trim();
  if (ID.test(raw)) return { id: raw };
  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = m?.[1] ?? null;
    }
  }
  if (!id || !ID.test(id)) return null;
  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return start ? { id, start } : { id };
}

/** Kapak görseli: "hq" her videoda vardır (4:3, kenar boşluklu); "max" 16:9 ve yüksek çözünürlüklüdür. */
export function youTubeThumbnail(id: string, size: 'hq' | 'max' = 'hq'): string {
  return `https://i.ytimg.com/vi/${id}/${size === 'max' ? 'maxresdefault' : 'hqdefault'}.jpg`;
}
