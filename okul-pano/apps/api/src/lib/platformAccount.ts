import { eq } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { users } from '../db/schema.ts';
import { badRequest } from './errors.ts';

/**
 * KVKK: platform ile okul tamamen ayrıdır. Platform yöneticisi hesabı hiçbir okula üye yapılamaz; kişi okulda da
 * çalışıyorsa okul için ayrı e-postayla hesap açılır (uygulamada hesaplar arasında hızlı geçiş vardır).
 */
export const PLATFORM_MEMBER_ERROR = 'Platform yöneticisi hesabı okula üye yapılamaz. Okul için ayrı bir e-postayla hesap açın.';

export async function assertNotPlatformAccount(db: AppDeps['db'], userId: string): Promise<void> {
  const [u] = await db.select({ sa: users.isSuperAdmin }).from(users).where(eq(users.id, userId));
  if (u?.sa) throw badRequest(PLATFORM_MEMBER_ERROR);
}
