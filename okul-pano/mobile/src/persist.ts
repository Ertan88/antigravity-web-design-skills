import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { AppState, Platform } from 'react-native';

/**
 * Son görülen veriler telefonda saklanır: uygulama açılınca ekranlar sunucuyu beklemeden bu verilerle çizilir,
 * güncelleri arkada gelir (sunucu uykudan uyanırken bile ekran boş kalmaz). Hesaba bağlıdır; çıkışta silinir.
 * KVKK: öğrenci gözlemleri ve kullanıcı listesi saklanmaz.
 */

const NAME = 'okulpano-cache.json';
const MAX_AGE_MS = 7 * 86400_000;
const SKIP = ['conduct/', 'members', 'teachers', 'students'];

type Saved = { owner: string; savedAt: number; state: DehydratedState };

const file = () => (Platform.OS === 'web' ? null : new File(Paths.document, NAME));

async function read(): Promise<Saved | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem(NAME);
      return raw ? (JSON.parse(raw) as Saved) : null;
    }
    const f = file()!;
    return f.exists ? (JSON.parse(await f.text()) as Saved) : null;
  } catch {
    return null;
  }
}

async function write(saved: Saved | null) {
  try {
    if (Platform.OS === 'web') {
      if (saved) localStorage.setItem(NAME, JSON.stringify(saved));
      else localStorage.removeItem(NAME);
      return;
    }
    const f = file()!;
    if (!saved) {
      if (f.exists) f.delete();
      return;
    }
    await f.write(JSON.stringify(saved));
  } catch {
    /* depolama dolu ya da erişilemiyor: önbelleksiz devam edilir */
  }
}

let owner: string | null = null;
let stop: (() => void) | null = null;
/** Açılışta saklanan veri yüklendi mi (açılış ekranı ağı beklemez) */
export let restored = false;

const keep = (key: readonly unknown[]) => {
  const resource = String(key[1] ?? '');
  return !SKIP.some((s) => resource.startsWith(s));
};

/** Saklanan veriyi önbelleğe yükler (yalnızca aynı hesap ve sunucu için) ve değişiklikleri kaydetmeye başlar */
export async function restoreQueries(qc: QueryClient, who: string) {
  const saved = await read();
  if (saved && saved.owner === who && Date.now() - saved.savedAt < MAX_AGE_MS) {
    hydrate(qc, saved.state);
    restored = true;
  }
  startSaving(qc, who);
}

/** Önbellek değiştikçe (birkaç saniyede bir) ve uygulama arka plana geçince kaydeder */
export function startSaving(qc: QueryClient, who: string) {
  stop?.();
  owner = who;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    if (owner !== who) return;
    const state = dehydrate(qc, { shouldDehydrateQuery: (q) => q.state.status === 'success' && keep(q.queryKey) });
    void write({ owner: who, savedAt: Date.now(), state });
  };
  const unsub = qc.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated' || e.action.type !== 'success' || timer) return;
    timer = setTimeout(save, 3000);
  });
  const app = AppState.addEventListener('change', (s) => s !== 'active' && save());
  stop = () => {
    unsub();
    app.remove();
    if (timer) clearTimeout(timer);
  };
}

/** Çıkışta ya da oturum geçersiz olunca saklanan veriler silinir */
export async function clearSaved() {
  stop?.();
  stop = null;
  owner = null;
  restored = false;
  await write(null);
}
