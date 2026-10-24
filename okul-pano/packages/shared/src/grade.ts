/** Kademe renkleri: aynı sınıf düzeyindeki tüm şubeler aynı renkte (9-A, 9-B… hepsi mavi) */
const GRADE_HUES: Record<number, string> = {
  1: '#06b6d4',
  2: '#a855f7',
  3: '#ec4899',
  4: '#f97316',
  5: '#14b8a6',
  6: '#22c55e',
  7: '#84cc16',
  8: '#eab308',
  9: '#0ea5e9',
  10: '#8b5cf6',
  11: '#f43f5e',
  12: '#f59e0b',
};
const FALLBACK_HUES = ['#0ea5e9', '#8b5cf6', '#f43f5e', '#f59e0b', '#10b981', '#ec4899'];

export function gradeHue(className: string): string {
  const name = className.trim().toLocaleLowerCase('tr-TR');
  const grade = /^(\d{1,2})/.exec(name)?.[1];
  if (grade && GRADE_HUES[Number(grade)]) return GRADE_HUES[Number(grade)]!;
  if (/^(haz|hz)/.test(name)) return '#64748b';
  // Sayısız adlar (ör. "Anasınıfı A"): şube harfi atılarak aynı kademe aynı renge düşer
  const level = name.replace(/[\s/-]*[a-zçğıöşü]$/u, '');
  let h = 0;
  for (const ch of level) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_HUES[h % FALLBACK_HUES.length]!;
}


/** Sınıf düzeyi (9-A → 9); sayı yoksa null */
export function gradeOf(className: string): number | null {
  const m = /^(\d{1,2})/.exec(className.trim());
  return m ? Number(m[1]) : null;
}

/** Doğal sıralama: 9-A, 9-B, 10-A, 11-A… (alfabetik "10-A" < "9-A" hatası olmadan) */
export function compareClassNames(a: string, b: string): number {
  const ga = gradeOf(a);
  const gb = gradeOf(b);
  if (ga !== null && gb !== null && ga !== gb) return ga - gb;
  if (ga === null !== (gb === null)) return ga === null ? 1 : -1;
  return a.localeCompare(b, 'tr', { numeric: true, sensitivity: 'base' });
}
