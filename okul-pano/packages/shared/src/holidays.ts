/**
 * Resmi ve dini tatiller. Sabit tarihli resmi tatiller her yıl aynıdır; Ramazan ve Kurban bayramları
 * Hicri takvime göre her yıl ~11 gün öne kayar (Diyanet takvimi, 2025–2030).
 * Okul kendi tatillerini (ara tatil, idari izin…) ayrıca ekleyebilir; Excel'deki tatil yazıları da tanınır.
 */

const FIXED: Record<string, string> = {
  '01-01': 'Yılbaşı',
  '04-23': 'Ulusal Egemenlik ve Çocuk Bayramı',
  '05-01': 'Emek ve Dayanışma Günü',
  '05-19': "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
  '07-15': 'Demokrasi ve Millî Birlik Günü',
  '08-30': 'Zafer Bayramı',
  '10-28': 'Cumhuriyet Bayramı Arifesi',
  '10-29': 'Cumhuriyet Bayramı',
};

/** Bayramın ilk günü ve süresi (gün); arife günü ayrıca eklenir */
const RELIGIOUS: Record<number, { ramazan: string; kurban: string }> = {
  2025: { ramazan: '2025-03-30', kurban: '2025-06-06' },
  2026: { ramazan: '2026-03-20', kurban: '2026-05-27' },
  2027: { ramazan: '2027-03-09', kurban: '2027-05-16' },
  2028: { ramazan: '2028-02-26', kurban: '2028-05-05' },
  2029: { ramazan: '2029-02-14', kurban: '2029-04-24' },
  2030: { ramazan: '2030-02-04', kurban: '2030-04-13' },
};

const pad = (n: number) => String(n).padStart(2, '0');

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Yılın resmi ve dini tatilleri: YYYY-AA-GG -> ad */
export function officialHolidays(year: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const [md, name] of Object.entries(FIXED)) out.set(`${year}-${md}`, name);
  const r = RELIGIOUS[year];
  if (r) {
    out.set(addDays(r.ramazan, -1), 'Ramazan Bayramı Arifesi');
    for (let i = 0; i < 3; i++) out.set(addDays(r.ramazan, i), `Ramazan Bayramı ${i + 1}. Gün`);
    out.set(addDays(r.kurban, -1), 'Kurban Bayramı Arifesi');
    for (let i = 0; i < 4; i++) out.set(addDays(r.kurban, i), `Kurban Bayramı ${i + 1}. Gün`);
  }
  return out;
}

/** Tarih resmi / dini tatilse adı */
export function officialHolidayOn(iso: string): string | null {
  return officialHolidays(Number(iso.slice(0, 4))).get(iso) ?? null;
}

const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

/** Hücredeki yazı ile eşleşen resmi tatil adı (tarih bulmak için) */
const KNOWN: { re: RegExp; key: string }[] = [
  { re: /cumhuriyet/, key: 'Cumhuriyet Bayramı' },
  { re: /ramazan|şeker bayram/, key: 'Ramazan Bayramı' },
  { re: /kurban/, key: 'Kurban Bayramı' },
  { re: /egemenlik|23\s*nisan|çocuk bayram/, key: 'Ulusal Egemenlik ve Çocuk Bayramı' },
  { re: /gençlik ve spor|19\s*mayıs|atatürk'?ü anma/, key: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
  { re: /zafer|30\s*ağustos/, key: 'Zafer Bayramı' },
  { re: /emek ve dayanışma|işçi bayram|1\s*mayıs/, key: 'Emek ve Dayanışma Günü' },
  { re: /demokrasi|15\s*temmuz/, key: 'Demokrasi ve Millî Birlik Günü' },
  { re: /yılbaşı|yeni yıl/, key: 'Yılbaşı' },
];

// "bayram" tek başına isim de olabilir (Bayram Yılmaz); "bayramı" ya da tatil sözcüğüyle birlikte aranır
const HOLIDAY_WORDS = /(bayram[ıi]|tatil|arife|yılbaşı|resm[iî] gün|idari izin|ara dinlenme|ara tatil|yarıyıl|sömestr|semest|okul kapalı|ders yok|nöbet yok)/;

/**
 * Hücredeki yazı bir tatil mi? Öğretmen adı yerine "29 EKİM CUMHURİYET BAYRAMI", "RESMİ TATİL",
 * "Kurban Bayramı 2. gün" gibi yazılar tatil sayılır. Dönen ad panoda ve panelde gösterilir.
 */
export function detectHolidayText(text: string): string | null {
  const t = lower(text.trim());
  if (t.length < 4 || !HOLIDAY_WORDS.test(t)) return null;
  // Okunaklı biçim: ilk harfler büyük
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR')))
    .join(' ');
}

/** Tatil yazısından ilgili ayın içindeki tarih(ler)i bulur (ör. "Cumhuriyet Bayramı" + Ekim 2026 -> 2026-10-29) */
export function holidayDatesInMonth(text: string, year: number, month: number): string[] {
  const t = lower(text);
  const known = KNOWN.find((k) => k.re.test(t));
  if (!known) return [];
  const prefix = `${year}-${pad(month)}-`;
  const day = /(\d+)\.\s*gün/.exec(t)?.[1];
  const arife = /arife/.test(t);
  return [...officialHolidays(year)]
    .filter(([iso, name]) => iso.startsWith(prefix) && name.startsWith(known.key))
    .filter(([, name]) => (arife ? name.includes('Arifesi') : !name.includes('Arifesi')))
    .filter(([, name]) => !day || name.includes(`${day}. Gün`))
    .map(([iso]) => iso);
}

const MONTH_WORDS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];

/** "AİT OLDUĞU AY: EKİM", "Ekim 2026 Nöbet Çizelgesi" gibi yazılardan ay (1–12) ve varsa yıl */
export function monthFromText(text: string): { month: number; year: number | null } | null {
  const t = lower(text).replace(/i̇/g, 'i');
  for (let i = 0; i < MONTH_WORDS.length; i++) {
    if (new RegExp(`(?<!\\p{L})${MONTH_WORDS[i]}(?!\\p{L})`, 'u').test(t)) {
      const year = /(?<!\d)(20\d{2})(?!\d)/.exec(t)?.[1];
      return { month: i + 1, year: year ? Number(year) : null };
    }
  }
  return null;
}

const MONTH_NAMES = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/**
 * Tatilin resmî tam adı: sabit tarihli millî bayram ve günler tarihleriyle anılır
 * ("Cumhuriyet Bayramı" -> "29 Ekim Cumhuriyet Bayramı"). Dini bayramlar ve okulun kendi tatilleri olduğu gibi kalır.
 */
export function holidayFullName(iso: string, name: string): string {
  const mmdd = iso.slice(5);
  if (FIXED[mmdd] !== name || mmdd === '01-01' || name.endsWith('Arifesi')) return name;
  return `${Number(iso.slice(8))} ${MONTH_NAMES[Number(iso.slice(5, 7))]} ${name}`;
}

/** Arife: yarım gün tatil (öğleden sonra); o gün nöbet ve görevler sürer */
export const isHalfDayHoliday = (name: string) => name.endsWith('Arifesi');
