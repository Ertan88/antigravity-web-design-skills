/** Kademe renkleri: aynı sınıf düzeyindeki tüm şubeler aynı renkte (9-A, 9-B… hepsi mavi) */
const GRADE_HUES: Record<number, string> = {
  1: '#06b6d4',
  2: '#3b82f6',
  3: '#e11d48',
  4: '#f97316',
  5: '#14b8a6',
  6: '#22c55e',
  7: '#84cc16',
  8: '#eab308',
  9: '#0ea5e9',
  10: '#14b8a6',
  11: '#f43f5e',
  12: '#f59e0b',
};
const FALLBACK_HUES = ['#0ea5e9', '#14b8a6', '#f43f5e', '#f59e0b', '#10b981', '#f97316'];

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
  // Program öneki olabilir: "AMP 9-A" (e-Okul'da aynı şubeyi iki program kullanınca)
  const m = /^(?:[A-Za-zÇĞİÖŞÜçğıöşü]{2,4}\s+)?(\d{1,2})/.exec(className.trim());
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

/**
 * Aynı saatte birleştirilmiş sınıflar tek adla: ["AMP 11-M", "AMP 11-A", "AMP 11-C"] → "AMP 11-ACM".
 * Aynı program ve düzeydeki şubeler yan yana, alfabetik; farklı olanlar virgülle ayrılır ("AMP 10-CT, ATP 10-A").
 * Şube adı tek harften uzunsa "/" ile ayrılır (9-AB/9-ÇK gibi karışmasın diye).
 */
export function joinClassNames(names: string[]): string {
  const groups = new Map<string, string[]>();
  for (const name of [...new Set(names.map((n) => n.trim()))].sort(compareClassNames)) {
    const m = /^(.*?\d{1,2})\s*-\s*(\S+)$/u.exec(name);
    if (!m) {
      groups.set(name, []);
      continue;
    }
    const prefix = `${m[1]}-`;
    groups.set(prefix, [...(groups.get(prefix) ?? []), m[2]!]);
  }
  return [...groups]
    .map(([prefix, sections]) => {
      if (!sections.length) return prefix;
      const sorted = sections.sort((a, b) => a.localeCompare(b, 'tr'));
      return prefix + (sorted.every((s) => [...s].length === 1) ? sorted.join('') : sorted.join('/'));
    })
    .join(', ');
}
