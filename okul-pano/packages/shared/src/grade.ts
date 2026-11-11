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

/**
 * Doğal sıralama: 9-A, 9-B, 10-A, 11-A… (alfabetik "10-A" < "9-A" hatası olmadan). Aynı düzeyde öneksiz ve AMP
 * (ana program) şubeleri birlikte, harf sırasıyla; ATP gibi diğer programlar ardından. Sayısız adlar en sonda.
 */
export function compareClassNames(a: string, b: string): number {
  const ga = gradeOf(a);
  const gb = gradeOf(b);
  if (ga !== null && gb !== null && ga !== gb) return ga - gb;
  if (ga === null !== (gb === null)) return ga === null ? 1 : -1;
  const pa = parseClassName(a);
  const pb = parseClassName(b);
  if (pa && pb) {
    const rank = (p: string | null) => (!p || p === 'AMP' ? '' : p);
    const ra = rank(pa.program);
    const rb = rank(pb.program);
    if (ra !== rb) return ra === '' ? -1 : rb === '' ? 1 : ra.localeCompare(rb, 'tr');
    const bySection = pa.section.localeCompare(pb.section, 'tr', { numeric: true, sensitivity: 'base' });
    if (bySection) return bySection;
  }
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

/** "AMP 10-C" → { program: "AMP", grade: 10, section: "C" }; tanınmayan ad için null */
export function parseClassName(name: string): { program: string | null; grade: number; section: string } | null {
  const m = /^(?:([A-Za-zÇĞİÖŞÜçğıöşü]{2,6})\s+)?(\d{1,2})\s*[-/]\s*(\S+)$/u.exec(name.trim());
  return m ? { program: m[1] ? m[1].toLocaleUpperCase('tr-TR') : null, grade: Number(m[2]), section: m[3]! } : null;
}

/**
 * Uzun sınıf adı (e-Okul'daki gibi): "AMP 10-C" → "AMP 10. Sınıf / C Şubesi". Aynı saatte birleştirilmiş sınıflar:
 * ["AMP 11-A", "AMP 11-C"] → "AMP 11. Sınıf / A, C Şubeleri". Tanınmayan adlar olduğu gibi kalır.
 */
export function classLongName(names: string | string[]): string {
  const list = [...new Set((Array.isArray(names) ? names : [names]).map((n) => n.trim()))].sort(compareClassNames);
  const groups = new Map<string, { head: string; sections: string[] }>();
  const other: string[] = [];
  for (const n of list) {
    const p = parseClassName(n);
    if (!p) {
      other.push(n);
      continue;
    }
    const head = `${p.program ? `${p.program} ` : ''}${p.grade}. Sınıf`;
    const g = groups.get(head) ?? { head, sections: [] };
    g.sections.push(p.section);
    groups.set(head, g);
  }
  return [
    ...[...groups.values()].map((g) => `${g.head} / ${g.sections.sort((a, b) => a.localeCompare(b, 'tr')).join(', ')} ${g.sections.length > 1 ? 'Şubeleri' : 'Şubesi'}`),
    ...other,
  ].join(' · ');
}

/**
 * Pano için kısa sınıf adı: "9/B". Okulda birden fazla program varsa (AMP, ATP) en çok sınıfı olan programın öneki
 * yazılmaz, diğerleri önekiyle ayrılır: "9/A" ve "ATP 9/A". Hangi programın yazılmayacağı okulun sınıflarından çıkar.
 */
export function shortClassLabeler(allNames: readonly string[]): (name: string) => string {
  const main = mainClassProgram(allNames);
  return (name: string) => {
    const p = parseClassName(name);
    if (!p) return name;
    return `${p.program && p.program !== main ? `${p.program} ` : ''}${p.grade}/${p.section}`;
  };
}

/** Okulda en çok sınıfı olan program öneki (ör. AMP); önekli sınıf yoksa null. Okula özel sabit yok, sınıflardan çıkar. */
export function mainClassProgram(allNames: readonly string[]): string | null {
  const count = new Map<string, number>();
  for (const n of allNames) {
    const p = parseClassName(n)?.program;
    if (p) count.set(p, (count.get(p) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Görünen sınıf adı: ana programın öneki yazılmaz ("AMP 10-A" → "10-A"), diğerleri kalır ("ATP 10-A") */
export function classDisplayName(name: string, main: string | null): string {
  const p = parseClassName(name);
  if (!p || !p.program || p.program !== main) return name;
  return name.trim().replace(/^\S+\s+/, '');
}

/**
 * Bir sınıf kümesinin kısa adı: bir düzeyin bütün şubeleriyse "12. sınıflar", birkaç düzeyin bütün şubeleriyse
 * "11 ve 12. sınıflar", değilse birleşik ad ("AMP 12-AB"). `all` okulun bütün sınıf adlarıdır.
 */
export function classSetLabel(names: readonly string[], all: readonly string[]): string {
  if (!names.length) return '';
  const grades = [...new Set(names.map(gradeOf))];
  const whole = grades.every((g) => g !== null && all.filter((n) => gradeOf(n) === g).every((n) => names.includes(n)));
  if (whole && grades.length <= 3) {
    const sorted = (grades as number[]).sort((a, b) => a - b);
    return `${sorted.length > 1 ? `${sorted.slice(0, -1).join(', ')} ve ${sorted.at(-1)}` : sorted[0]}. sınıflar`;
  }
  return joinClassNames([...names]);
}
