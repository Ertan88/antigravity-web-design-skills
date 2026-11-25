import { schoolFullName } from '@okulpano/shared';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { schools, users } from '../db/schema.ts';
import { notifyUsers } from './push.ts';
import { addToInbox } from '../routes/notifications.ts';

/*
 * Kurum kodu (MEB, 6 hane) okulu tanımak içindir. Aynı kodla ikinci kayıt engellenmez: biri başka okulun kodunu
 * yazarsa gerçek okul kaydolamaz duruma düşmesin. Bunun yerine platform yöneticisine bildirim gider ve platform
 * listesinde uyarı görünür; kararı platform yöneticisi verir.
 */

/** Kodları birden çok okulda geçen kurum kodları */
export async function duplicateInstitutionCodes(deps: Pick<AppDeps, 'db'>): Promise<Set<string>> {
  const rows = await deps.db.select({ code: schools.institutionCode }).from(schools).where(isNotNull(schools.institutionCode));
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const r of rows) {
    if (!r.code) continue;
    if (seen.has(r.code)) dup.add(r.code);
    seen.add(r.code);
  }
  return dup;
}

/** Okulun kodu başka bir okulda da varsa platform yöneticilerine bildirir */
export async function warnDuplicateInstitution(deps: AppDeps, school: Pick<typeof schools.$inferSelect, 'id' | 'name' | 'settings' | 'institutionCode'>): Promise<boolean> {
  const code = school.institutionCode;
  if (!code) return false;
  const others = await deps.db
    .select({ id: schools.id, name: schools.name, settings: schools.settings })
    .from(schools)
    .where(and(eq(schools.institutionCode, code), ne(schools.id, school.id)));
  if (!others.length) return false;
  const admins = (await deps.db.select({ id: users.id }).from(users).where(eq(users.isSuperAdmin, true))).map((u) => u.id);
  const title = 'Aynı kurum kodu iki okulda';
  const list = others.map((o) => schoolFullName(o.name, o.settings?.schoolType)).join(', ');
  const body = `${schoolFullName(school.name, school.settings?.schoolType)} ${code} kurum koduyla kaydedildi. Bu kod şu okulda da kayıtlı: ${list}. Abonelikler listesinden kontrol edin.`;
  await addToInbox(deps.db, admins, { key: `institution-code:${school.id}:${code}`, kind: 'institution-code', title, body, to: '/platform' });
  notifyUsers(deps, admins, { title, body });
  return true;
}
