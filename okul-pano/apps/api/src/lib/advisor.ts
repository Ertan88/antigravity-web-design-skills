import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DB } from '../db/client.ts';
import { classGroups, timetableEntries } from '../db/schema.ts';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/** Rehberlik dersi (MEB programında "Rehberlik ve Yönlendirme"; e-Okul bu derse çoğu zaman öğretmen yazmaz) */
const GUIDANCE = sql`lower(${timetableEntries.subject}) like 'rehberlik%'`;

/**
 * Öğretmeni boş rehberlik derslerine sınıfın rehber öğretmeni yazılır. Rehber öğretmen değiştiyse önceki rehber
 * öğretmene yazılmış rehberlik dersleri de yenisine geçer (ya da rehber kaldırıldıysa boşalır).
 */
export async function applyAdvisor(db: DB | Tx, schoolId: string, classId: string, advisorId: string | null, previousId: string | null) {
  const owner = previousId ? or(isNull(timetableEntries.teacherId), eq(timetableEntries.teacherId, previousId)) : isNull(timetableEntries.teacherId);
  await db
    .update(timetableEntries)
    .set({ teacherId: advisorId })
    .where(and(eq(timetableEntries.schoolId, schoolId), eq(timetableEntries.classGroupId, classId), GUIDANCE, owner));
}

/** Bütün sınıflar: öğretmeni boş rehberlik dersleri sınıfların rehber öğretmenine (ders programı yüklendikten sonra) */
export async function fillGuidanceLessons(db: DB | Tx, schoolId: string, classIds?: string[]) {
  const rows = await db
    .select({ id: classGroups.id, advisor: classGroups.advisorTeacherId })
    .from(classGroups)
    .where(and(eq(classGroups.schoolId, schoolId), classIds?.length ? inArray(classGroups.id, classIds) : undefined));
  for (const r of rows) if (r.advisor) await applyAdvisor(db, schoolId, r.id, r.advisor, null);
}
