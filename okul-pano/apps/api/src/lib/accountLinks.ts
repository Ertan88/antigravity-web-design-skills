import { eq } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { accountLinks } from '../db/schema.ts';

/**
 * Bir hesabın şifresi değişince ya da sıfırlanınca o hesaba kurulmuş platform bağlantısı (web hesap geçişi) kaldırılır:
 * bağlantı eski şifreyle doğrulanmıştı. Platform yöneticisi bir sonraki geçişte okul hesabını yeni şifreyle yeniden bağlar.
 */
export async function dropLinksTo(db: AppDeps['db'], userId: string) {
  await db.delete(accountLinks).where(eq(accountLinks.schoolUserId, userId));
}
