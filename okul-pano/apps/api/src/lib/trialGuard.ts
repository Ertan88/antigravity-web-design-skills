import { schoolFullName } from '@okulpano/shared';
import { createHmac } from 'node:crypto';
import { and, eq, lt, ne, or, isNull } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { schools, trialMarks, users, type TrialFlag } from '../db/schema.ts';
import { notifyUsers } from './push.ts';
import { addToInbox } from '../routes/notifications.ts';

/*
 * Deneme süresinin kötüye kullanımını önleme: aynı okul her ay yeni e-postayla kaydolup sürekli deneme kullanmasın.
 * Üç işaret: kurum kodu, telefon numarası ve TV'nin cihaz kimliği daha önce başka bir denemede kullanıldıysa
 * - kayıt sırasında (kod, telefon): okul açılır ama etkin olmaz, platform yöneticisi onaylar;
 * - TV eşleştirmesinde (cihaz): eşleştirme durur, platform yöneticisi okulu onaylayınca açılır.
 * Engellemek yerine onaya düşürülür: müdürü değişen ya da geri dönen gerçek okul da takılabilir.
 * Değerler gizli anahtarla özetlenir (HMAC); telefon numarası geri çıkarılamaz. Kayıtlar 2 yıl tutulur.
 */

/** İşaret kayıtlarının saklama süresi */
export const TRIAL_MARK_TTL_MS = 2 * 365 * 86400_000;

export const TRIAL_FLAG_TEXT: Record<TrialFlag, string> = {
  code: 'kurum kodu daha önce deneme kullanmış',
  phone: 'telefon numarası daha önce deneme kullanmış',
  device: 'TV daha önce başka bir okulun denemesinde kullanılmış',
};

/** Telefonun son 10 hanesi: "0532…", "+90532…" ve "532…" aynı numaradır */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

export function markHash(deps: Pick<AppDeps, 'env'>, kind: TrialFlag, value: string): string {
  return createHmac('sha256', deps.env.JWT_SECRET).update(`trial:${kind}:${value}`).digest('hex');
}

/** Başka bir okulun (ya da silinmiş bir okulun) bu değerle deneme kullanıp kullanmadığı */
async function usedElsewhere(deps: Pick<AppDeps, 'db'>, kind: TrialFlag, hash: string, schoolId?: string): Promise<boolean> {
  const [row] = await deps.db
    .select({ id: trialMarks.id })
    .from(trialMarks)
    .where(and(eq(trialMarks.kind, kind), eq(trialMarks.valueHash, hash), schoolId ? or(isNull(trialMarks.schoolId), ne(trialMarks.schoolId, schoolId)) : undefined))
    .limit(1);
  return Boolean(row);
}

/** Kayıt başvurusunun işaretleri */
export async function signupFlags(deps: Pick<AppDeps, 'db' | 'env'>, input: { institutionCode: string; phone: string }): Promise<TrialFlag[]> {
  const flags: TrialFlag[] = [];
  const [codeSchool] = await deps.db.select({ id: schools.id }).from(schools).where(eq(schools.institutionCode, input.institutionCode)).limit(1);
  if (codeSchool || (await usedElsewhere(deps, 'code', markHash(deps, 'code', input.institutionCode)))) flags.push('code');
  if (await usedElsewhere(deps, 'phone', markHash(deps, 'phone', normalizePhone(input.phone)))) flags.push('phone');
  return flags;
}

/** Kayıtla açılan okulun kurum kodu ve telefonu denemeyi kullanmış sayılır */
export async function recordSignupMarks(deps: Pick<AppDeps, 'db' | 'env'>, schoolId: string, input: { institutionCode: string | null; phone: string }) {
  const rows: (typeof trialMarks.$inferInsert)[] = [{ kind: 'phone', valueHash: markHash(deps, 'phone', normalizePhone(input.phone)), schoolId }];
  if (input.institutionCode) rows.push({ kind: 'code', valueHash: markHash(deps, 'code', input.institutionCode), schoolId });
  await deps.db.insert(trialMarks).values(rows);
}

/** TV cihaz kimliği (uygulamadan gelir); boş ya da tuhafsa yok sayılır */
export function deviceHashOf(deps: Pick<AppDeps, 'env'>, raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!/^[\w-]{6,128}$/.test(id)) return null;
  return markHash(deps, 'device', id);
}

/**
 * Deneme paketindeki okula TV eşleşirken: TV başka bir denemede kullanıldıysa okul onaya düşer (false döner).
 * Ücretli okul ve platform yöneticisinin onayladığı okul denetlenmez. Eşleşen TV denemeyi kullanmış sayılır.
 */
export async function checkTrialDevice(deps: AppDeps, school: typeof schools.$inferSelect, deviceHash: string | null): Promise<boolean> {
  if (!deviceHash || school.plan !== 'trial') return true;
  if (!school.trialApprovedAt && (await usedElsewhere(deps, 'device', deviceHash, school.id))) {
    if (!school.trialFlags.includes('device')) {
      await deps.db.update(schools).set({ trialFlags: [...school.trialFlags, 'device'] }).where(eq(schools.id, school.id));
      await tellPlatformReview(deps, school, ['device']);
    }
    return false;
  }
  const [own] = await deps.db
    .select({ id: trialMarks.id })
    .from(trialMarks)
    .where(and(eq(trialMarks.kind, 'device'), eq(trialMarks.valueHash, deviceHash), eq(trialMarks.schoolId, school.id)))
    .limit(1);
  if (!own) await deps.db.insert(trialMarks).values({ kind: 'device', valueHash: deviceHash, schoolId: school.id });
  return true;
}

/** Platform yöneticilerine: onay bekleyen okul */
export async function tellPlatformReview(deps: AppDeps, school: Pick<typeof schools.$inferSelect, 'id' | 'name' | 'settings'>, flags: TrialFlag[]) {
  const admins = (await deps.db.select({ id: users.id }).from(users).where(eq(users.isSuperAdmin, true))).map((u) => u.id);
  const title = 'Okul onay bekliyor';
  const body = `${schoolFullName(school.name, school.settings?.schoolType)}: ${flags.map((f) => TRIAL_FLAG_TEXT[f]).join(', ')}. Abonelikler listesinden inceleyip onaylayın.`;
  await addToInbox(deps.db, admins, { key: `trial-review:${school.id}:${flags.join(',')}`, kind: 'trial-review', title, body, to: '/platform' });
  notifyUsers(deps, admins, { title, body });
}

/** 2 yıldan eski işaret kayıtları silinir */
export async function runTrialMarkRetention(deps: Pick<AppDeps, 'db'>, now = new Date()) {
  await deps.db.delete(trialMarks).where(lt(trialMarks.createdAt, new Date(now.getTime() - TRIAL_MARK_TTL_MS)));
}
