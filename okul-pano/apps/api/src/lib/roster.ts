import { normalizeName } from '@okulpano/shared';
import { eq } from 'drizzle-orm';
import type { DB } from '../db/client.ts';
import { teachers } from '../db/schema.ts';

/** Basit düzenleme mesafesi: "Ayse Demır" yazılmışsa "Ayşe Demir mi?" önerisi için */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Türkçe karakter hatalarını da yakalamak için harfleri sadeleştirir */
export const loose = (s: string) =>
  normalizeName(s).replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

const tokens = (s: string) => loose(s).split(/[\s.]+/).filter(Boolean);

/**
 * Kısaltmalı yazımlar: "Yasemin E.Hakverdi" = "Yasemin Emlek Hakverdi", "M.Akkaya" = "Mustafa Akkaya".
 * Sözcük sayısı aynı olmalı; her sözcük ya aynıdır ya da tek harflik baş harftir. Soyad kısaltılamaz.
 */
export function abbreviationMatches(written: string, full: string): boolean {
  const a = tokens(written);
  const b = tokens(full);
  if (a.length !== b.length || a.length < 2) return false;
  if (a[a.length - 1] !== b[b.length - 1]) return false;
  return a.every((w, i) => w === b[i] || (w.length === 1 && b[i]!.startsWith(w)));
}

export interface RosterTeacher {
  id: string;
  fullName: string;
  isActive: boolean;
}

/**
 * Okulun öğretmen kadrosu ve Excel'den gelen isimleri kadroyla eşleştiren yardımcılar.
 * Eşleşme sırası: birebir (büyük/küçük harf duyarsız) → Türkçe karakter hatası → kısaltma.
 */
export async function loadRoster(db: DB, schoolId: string) {
  const rows = await db
    .select({ id: teachers.id, fullName: teachers.fullName, isActive: teachers.isActive })
    .from(teachers)
    .where(eq(teachers.schoolId, schoolId));
  // Aynı isimde aktif ve pasif kayıt varsa aktif olan seçilir
  rows.sort((a, b) => Number(b.isActive) - Number(a.isActive));
  const byName = new Map<string, RosterTeacher>();
  const byLoose = new Map<string, RosterTeacher[]>();
  for (const t of rows) {
    if (!byName.has(normalizeName(t.fullName))) byName.set(normalizeName(t.fullName), t);
    byLoose.set(loose(t.fullName), [...(byLoose.get(loose(t.fullName)) ?? []), t]);
  }

  /** Kesin eşleşme yoksa null; birden fazla aday varsa da null (yanlış kişiye atamamak için) */
  const find = (name: string): RosterTeacher | null => {
    const exact = byName.get(normalizeName(name));
    if (exact) return exact;
    const sameLoose = byLoose.get(loose(name));
    if (sameLoose?.length === 1) return sameLoose[0]!;
    const abbrev = rows.filter((t) => abbreviationMatches(name, t.fullName));
    const active = abbrev.filter((t) => t.isActive);
    if (active.length === 1) return active[0]!;
    if (abbrev.length === 1) return abbrev[0]!;
    return null;
  };

  const suggest = (name: string): string | null => {
    const target = loose(name);
    let best: { name: string; d: number } | null = null;
    for (const t of rows) {
      const d = editDistance(target, loose(t.fullName));
      if (d <= Math.max(2, Math.floor(target.length / 6)) && (!best || d < best.d)) best = { name: t.fullName, d };
    }
    return best?.name ?? null;
  };
  return { rows, byName, find, suggest };
}
