import { and, eq, lt, or, isNull, sql } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { loginFailures } from '../db/schema.ts';
import { sha256 } from './crypto.ts';

/*
 * Hesap başına hatalı giriş kilidi: 15 dakika içinde 5 hatalı denemede hesap 5 dakika bekletilir. Sayaç veritabanında
 * durur; sunucu yeniden başlayınca (Render uykusu, yeni sürüm) sıfırlanmaz ve birden çok sunucu kopyasında ortaktır.
 */
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 15 * 60_000;
const LOCK_MS = 5 * 60_000;

type Db = AppDeps['db'];
const keyOf = (key: string) => sha256(`login:${key.toLowerCase()}`);

/** Kilit sürüyorsa kalan saniye, yoksa 0 */
export async function lockedFor(db: Db, key: string, now = new Date()): Promise<number> {
  const [row] = await db.select({ until: loginFailures.lockedUntil }).from(loginFailures).where(eq(loginFailures.keyHash, keyOf(key)));
  return row?.until ? Math.max(0, (row.until.getTime() - now.getTime()) / 1000) : 0;
}

export async function noteFailure(db: Db, key: string, now = new Date()): Promise<void> {
  const windowStart = new Date(now.getTime() - FAIL_WINDOW_MS);
  const [row] = await db
    .insert(loginFailures)
    .values({ keyHash: keyOf(key), count: 1, firstAt: now })
    .onConflictDoUpdate({
      target: loginFailures.keyHash,
      set: {
        count: sql`case when ${loginFailures.firstAt} < ${windowStart} then 1 else ${loginFailures.count} + 1 end`,
        firstAt: sql`case when ${loginFailures.firstAt} < ${windowStart} then ${now} else ${loginFailures.firstAt} end`,
      },
    })
    .returning({ count: loginFailures.count });
  if ((row?.count ?? 0) >= FAIL_LIMIT) {
    await db
      .update(loginFailures)
      .set({ count: 0, firstAt: now, lockedUntil: new Date(now.getTime() + LOCK_MS) })
      .where(eq(loginFailures.keyHash, keyOf(key)));
  }
  // Süresi geçmiş kayıtlar ara ara temizlenir
  if (Math.random() < 0.05) {
    await db
      .delete(loginFailures)
      .where(and(lt(loginFailures.firstAt, windowStart), or(isNull(loginFailures.lockedUntil), lt(loginFailures.lockedUntil, now))));
  }
}

export async function clearFailures(db: Db, key: string): Promise<void> {
  await db.delete(loginFailures).where(eq(loginFailures.keyHash, keyOf(key)));
}
