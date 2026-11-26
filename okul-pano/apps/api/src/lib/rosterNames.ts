import { normalizeName, tidyName } from '@okulpano/shared';
import { and, eq } from 'drizzle-orm';
import type { DB } from '../db/client.ts';
import { teachers } from '../db/schema.ts';

/*
 * Kişi adları her yerde kadrodaki yazımla görünür (müdür ve müdür yardımcıları da kadrodadır). Elle ya da Excel'den
 * yazılan ad (ör. "ÜMİT KILIÇ", "Md. Yrd. Ümit Kılıç") kadroda tek bir kişiyle eşleşirse kadrodaki yazıma çevrilir;
 * eşleşmezse olduğu gibi (fazla boşluklar temizlenerek) kalır.
 */

/** Ad başındaki ünvan: "Md. Yrd.", "Müdür Yardımcısı", "Müdür", "Öğrt." … */
const TITLE_PREFIX = /^(?:(?:müdür|md\.?)\s*(?:başyardımcısı|baş\s*yrd\.?|yardımcısı|yrd\.?)?|öğretmen|öğrt\.?|öğr\.?)\s+/iu;

export async function rosterSpelling(db: DB, schoolId: string): Promise<(name: string) => string> {
  const rows = await db.select({ fullName: teachers.fullName }).from(teachers).where(and(eq(teachers.schoolId, schoolId), eq(teachers.isActive, true)));
  const byKey = new Map<string, string | null>();
  for (const r of rows) {
    const key = normalizeName(r.fullName);
    // Aynı adda iki kişi: hangisi olduğu bilinemez, ad değiştirilmez
    byKey.set(key, byKey.has(key) ? null : r.fullName);
  }
  return (name: string) => {
    const clean = tidyName(name);
    const direct = byKey.get(normalizeName(clean));
    if (direct) return direct;
    const bare = clean.replace(TITLE_PREFIX, '');
    return (bare !== clean && byKey.get(normalizeName(bare))) || clean;
  };
}
