import { normalizeName } from '@okulpano/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DB } from '../db/client.ts';
import { auditLogs, memberships, teachers, users } from '../db/schema.ts';

/**
 * Hesap ile kadrodaki öğretmen kaydını kendiliğinden bağlar: müdür ve müdür yardımcısı da öğretmendir; ders programı ve
 * nöbet yüklenince kendi dersleri ve nöbetleri ayrıca bir işlem yapılmadan görünür.
 *
 * Kural (yanlış kişiye bağlamamak için): hesaptaki ad kadroda **tek** bir etkin kayıtla birebir eşleşir (büyük-küçük
 * harf ve boşluk farkı yok sayılır), o kayıt başka bir hesaba bağlı değildir ve okulda aynı adda ikinci bir hesap yoktur.
 * Yetkilinin elle kurduğu ya da kaldırdığı bağa (teacherLinkManual) dokunulmaz. Kişinin kendisi bağ kuramaz.
 */
export async function autoLinkTeachers(db: DB, schoolId: string): Promise<number> {
  const accounts = await db
    .select({ id: memberships.id, userId: memberships.userId, teacherId: memberships.teacherId, manual: memberships.teacherLinkManual, fullName: users.fullName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.schoolId, schoolId));
  const open = accounts.filter((a) => !a.teacherId && !a.manual);
  if (!open.length) {
    await syncLinkedNames(db, schoolId);
    return 0;
  }
  const roster = await db
    .select({ id: teachers.id, fullName: teachers.fullName })
    .from(teachers)
    .where(and(eq(teachers.schoolId, schoolId), eq(teachers.isActive, true)));
  const linked = new Set(accounts.map((a) => a.teacherId).filter(Boolean));
  const byName = new Map<string, { id: string; fullName: string }[]>();
  for (const t of roster) byName.set(normalizeName(t.fullName), [...(byName.get(normalizeName(t.fullName)) ?? []), t]);
  const accountsByName = new Map<string, number>();
  for (const a of accounts) accountsByName.set(normalizeName(a.fullName), (accountsByName.get(normalizeName(a.fullName)) ?? 0) + 1);

  let n = 0;
  for (const a of open) {
    const key = normalizeName(a.fullName);
    if (!key || accountsByName.get(key) !== 1) continue;
    const found = byName.get(key) ?? [];
    if (found.length !== 1 || linked.has(found[0]!.id)) continue;
    const t = found[0]!;
    // Aynı anda iki istek gelirse yalnızca hâlâ bağsız olan hesap bağlanır
    const done = await db
      .update(memberships)
      .set({ teacherId: t.id })
      .where(and(eq(memberships.id, a.id), isNull(memberships.teacherId), eq(memberships.teacherLinkManual, false)))
      .returning({ id: memberships.id });
    if (!done.length) continue;
    linked.add(t.id);
    n++;
    await db.insert(auditLogs).values({ schoolId, userId: null, action: 'update', entity: 'Kullanıcı öğretmen eşleşmesi', entityId: a.id, summary: `${a.fullName} kadrodaki kayıtla kendiliğinden eşleşti` });
  }
  await syncLinkedNames(db, schoolId);
  return n;
}

/**
 * Kadroya bağlı hesapların adı kadrodaki yazımla aynı olur (menü, bildirim, onaylayan, kullanıcı listesi…): kadroda ad
 * değişince ya da hesap kadroya bağlanınca hesap adı da değişir. Kişi birden çok okuldaysa son değişen kadronun yazımı
 * geçerlidir.
 */
export async function syncLinkedNames(db: DB, schoolId: string): Promise<number> {
  const rows = await db.execute(sql`
    update users u set full_name = t.full_name
    from memberships m join teachers t on t.id = m.teacher_id
    where m.school_id = ${schoolId} and m.user_id = u.id and u.full_name <> t.full_name and u.is_super_admin = false
    returning u.id`);
  return (rows as unknown as { rows?: unknown[] }).rows?.length ?? 0;
}

/** Kişinin bütün okullarında (ör. adını değiştirince) */
export async function autoLinkTeachersForUser(db: DB, userId: string): Promise<void> {
  const rows = await db.select({ schoolId: memberships.schoolId }).from(memberships).where(eq(memberships.userId, userId));
  for (const r of rows) await autoLinkTeachers(db, r.schoolId);
}

/** Açılışta bütün okullar için bir kez (eski hesaplar) */
export async function autoLinkAllSchools(db: DB): Promise<number> {
  const rows = await db.selectDistinct({ schoolId: memberships.schoolId }).from(memberships).where(isNull(memberships.teacherId));
  let n = 0;
  for (const r of rows) n += await autoLinkTeachers(db, r.schoolId);
  return n;
}
