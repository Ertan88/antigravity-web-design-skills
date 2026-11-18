import { storage } from './storage.ts';

/**
 * Bu telefonda kayıtlı hesaplar (hızlı hesap geçişi). Platform ve okul ayrı hesaplardır (KVKK); aynı kişinin iki hesabı
 * arasında şifre sormadan geçilir. Etkin hesabın yenileme anahtarı oturumda durur; diğerlerininki burada (şifreli depo).
 */
export interface SavedAccount {
  userId: string;
  server: string;
  email: string;
  fullName: string;
  kind: 'platform' | 'school';
  /** "Örnek Anadolu Lisesi · Öğretmen" */
  detail: string;
  /** Okul adı türüyle ("Örnek Anadolu Lisesi"); eski kayıtlarda yok, detail kullanılır */
  school?: string;
  /** Ünvan ve branş ("Müdür Yardımcısı · Matematik") */
  role?: string;
  /** Etkin olmayan hesabın yenileme anahtarı; null: yeniden giriş gerekir ya da etkin hesap */
  refresh: string | null;
}

/**
 * Hesap geçişi yalnızca platform yöneticisine açıktır: açık hesap platform hesabıysa ya da telefonda bir platform hesabı
 * kayıtlıysa (platform yöneticisinin kendi telefonu). Diğer kullanıcılarda "Hesap değiştir" ve kayıtlı hesap listesi görünmez.
 */
export function switchAllowed(list: SavedAccount[], isSuperAdmin: boolean | undefined): boolean {
  return Boolean(isSuperAdmin) || list.some((a) => a.kind === 'platform');
}

const KEY = 'okulpano.accounts';
const MAX = 5;

export async function loadAccounts(): Promise<SavedAccount[]> {
  try {
    const raw = await storage.get(KEY);
    const list = raw ? (JSON.parse(raw) as SavedAccount[]) : [];
    return Array.isArray(list) ? list.filter((a) => a && a.userId && a.server) : [];
  } catch {
    return [];
  }
}

export async function saveAccounts(list: SavedAccount[]): Promise<void> {
  await storage.set(KEY, list.length ? JSON.stringify(list.slice(0, MAX)) : null).catch(() => undefined);
}

/** Hesabı ekler ya da günceller (aynı sunucu ve kullanıcı); refresh verilmezse eskisi korunur */
export function upsert(list: SavedAccount[], a: Omit<SavedAccount, 'refresh'> & { refresh?: string | null }): SavedAccount[] {
  const i = list.findIndex((x) => x.userId === a.userId && x.server === a.server);
  const prev = i >= 0 ? list[i]! : null;
  const next: SavedAccount = { ...a, refresh: a.refresh === undefined ? (prev?.refresh ?? null) : a.refresh };
  return i >= 0 ? list.map((x, j) => (j === i ? next : x)) : [...list, next];
}

/** E-postayı yarı gizler (giriş ekranında yanından geçen görmesin): "ayse.yilmaz@ornek.test" → "ay•••@ornek.test" */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return email;
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}
