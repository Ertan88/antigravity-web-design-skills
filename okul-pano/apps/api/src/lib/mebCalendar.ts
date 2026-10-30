import { academicYearLabel, academicYearOf, isCalendarTitle, parseMebCalendar, zonedParts, type AcademicCalendarData } from '@okulpano/shared';
import { eq } from 'drizzle-orm';
import type { AppDeps } from '../context.ts';
import { academicCalendars, users } from '../db/schema.ts';
import { addToInbox } from '../routes/notifications.ts';
import { notifyUsers } from './push.ts';

/**
 * MEB çalışma takvimi tarayıcısı. MEB her yıl haziran ortasından itibaren (kesin tarih yok) "… Eğitim Öğretim Yılı
 * Takvimi Açıklandı" duyurusunu yayımlar. Sunucu haziranın başından itibaren günde bir kez MEB'in ana sayfasındaki ve
 * haber listesindeki bağlantılara bakar; başlığı o eğitim yılının takvimi olan duyuruyu açıp tarihleri okur.
 */

type Fetch = typeof fetch;
const UA = 'Mozilla/5.0 (compatible; OkulYayin/1.0; +calisma-takvimi)';

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  ccedil: 'ç', Ccedil: 'Ç', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', gbreve: 'ğ', Gbreve: 'Ğ', scedil: 'ş', Scedil: 'Ş', inodot: 'ı', Idot: 'İ',
};

/** HTML'den düz metin: betik ve stil atılır, etiketler boşluğa, varlıklar karaktere çevrilir */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n] ?? m)
    .replace(/\s*\.\s*(\.\s*)+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sayfadaki bağlantılardan bu eğitim yılının takvim duyurusu olabilecekler */
export function calendarLinks(html: string, base: string, startYear: number): string[] {
  const out = new Set<string>();
  const slug = `${startYear}${startYear + 1}`;
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1]!;
    const title = htmlToText(`${m[2]} ${/title\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] ?? ''}`);
    if (isCalendarTitle(title, startYear) || (href.includes(slug) && /takvim/i.test(href))) {
      try {
        out.add(new URL(href, base).toString());
      } catch {
        /* geçersiz adres */
      }
    }
  }
  return [...out];
}

async function getText(url: string, fetchFn: Fetch): Promise<string> {
  const res = await fetchFn(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

export interface ScanResult {
  outcome: 'saved' | 'confirmed' | 'review' | 'unchanged' | 'not-found';
  url?: string;
  data?: AcademicCalendarData;
  message: string;
}

/** Alan sırasından bağımsız karşılaştırma (Postgres jsonb anahtarların sırasını değiştirir) */
const canon = (c: AcademicCalendarData) =>
  [c.lessonsStart, c.term1End, c.term2Start, c.lessonsEnd, ...c.breaks.map((b) => `${b.name}|${b.start}|${b.end}`), ...(c.seminars ?? []).map((p) => `s|${p.start}|${p.end}`)].join(',');
const same = (a: AcademicCalendarData, b: AcademicCalendarData) => canon(a) === canon(b);

/**
 * Bir eğitim yılının takvimini arar ve kaydeder. Kurallar:
 * - Kayıt yoksa: bulunan takvim hemen uygulanır (status 'review': platform yöneticisi bir göz atsın).
 * - Kurulumla gelen (builtin) ya da taranmış kayıtla aynıysa: MEB'den doğrulandı olarak işaretlenir.
 * - Farklıysa ya da elle girilmişse: üzerine yazılmaz, "onay bekleyen" olarak saklanır ve bildirim gider.
 */
export async function scanMebCalendar(deps: AppDeps, startYear: number, opts: { url?: string; fetchFn?: Fetch; now?: Date } = {}): Promise<ScanResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const label = academicYearLabel(startYear);
  const candidates = new Set<string>(opts.url ? [opts.url] : []);
  if (!opts.url) {
    for (const index of deps.env.MEB_INDEX_URLS.split(',').map((x) => x.trim()).filter(Boolean)) {
      try {
        for (const link of calendarLinks(await getText(index, fetchFn), index, startYear)) candidates.add(link);
      } catch (err) {
        console.warn('MEB taraması:', (err as Error).message);
      }
    }
  }
  const now = opts.now ?? new Date();
  const [row] = await deps.db.select().from(academicCalendars).where(eq(academicCalendars.startYear, startYear));
  for (const url of candidates) {
    let data: AcademicCalendarData | null = null;
    try {
      data = parseMebCalendar(htmlToText(await getText(url, fetchFn)), startYear);
    } catch (err) {
      console.warn('MEB taraması:', (err as Error).message);
    }
    if (!data) continue;

    if (!row) {
      await deps.db.insert(academicCalendars).values({ startYear, data, source: 'meb', sourceUrl: url, status: 'review', checkedAt: now });
      await tellPlatform(deps, `meb-calendar:${startYear}:found`, `${label} çalışma takvimi işlendi`, `MEB duyurusundan okundu ve okulların tatillerine eklendi. Ders Düzeni › Tatil Takvimi'nden kontrol edin.`);
      return { outcome: 'saved', url, data, message: `${label} takvimi MEB duyurusundan okundu ve uygulandı.` };
    }
    if (same(row.data, data)) {
      const confirm = row.source !== 'manual';
      await deps.db
        .update(academicCalendars)
        .set({ ...(confirm ? { source: 'meb' as const, sourceUrl: url, status: 'confirmed' as const } : {}), pending: null, checkedAt: now })
        .where(eq(academicCalendars.startYear, startYear));
      return { outcome: row.source === 'meb' && row.status === 'confirmed' ? 'unchanged' : 'confirmed', url, data, message: `${label} takvimi MEB duyurusuyla aynı.` };
    }
    await deps.db
      .update(academicCalendars)
      .set({ status: 'review', pending: { data, sourceUrl: url, foundAt: now.toISOString() }, checkedAt: now })
      .where(eq(academicCalendars.startYear, startYear));
    await tellPlatform(deps, `meb-calendar:${startYear}:diff:${canon(data)}`, `${label} çalışma takviminde fark var`, `MEB duyurusundaki tarihler sistemdekinden farklı. Ders Düzeni › Tatil Takvimi'nden inceleyip onaylayın.`);
    return { outcome: 'review', url, data, message: `${label}: MEB duyurusu sistemdeki takvimden farklı; onayınızı bekliyor.` };
  }
  if (row) await deps.db.update(academicCalendars).set({ checkedAt: now }).where(eq(academicCalendars.startYear, startYear));
  return {
    outcome: 'not-found',
    message: candidates.size
      ? `${label} duyurusu bulundu ama tarihler okunamadı. Tarihleri elle girebilirsiniz.`
      : `${label} çalışma takvimi MEB'in sitesinde henüz bulunamadı.`,
  };
}

/** Platform yöneticilerine: bildirim kutusu ve telefon */
async function tellPlatform(deps: AppDeps, key: string, title: string, body: string) {
  const admins = (await deps.db.select({ id: users.id }).from(users).where(eq(users.isSuperAdmin, true))).map((u) => u.id);
  await addToInbox(deps.db, admins, { key, kind: 'meb-calendar', title, body, to: '/tatil-takvimi#meb' });
  notifyUsers(deps, admins, { title, body });
}

const lastTry = new Map<number, number>();

/**
 * Günlük iş: içinde bulunulan eğitim yılı ve (haziran başından itibaren) gelecek eğitim yılı için takvim yoksa ya da
 * yalnızca kurulumla gelen veri varsa MEB'i tarar. Her yıl için günde en çok bir deneme. Gelecek yılın takvimi
 * 25 Ağustos'a kadar bulunamazsa platform yöneticisine "elle girin" bildirimi gider.
 */
export async function runMebCalendarJob(deps: AppDeps, now = new Date()) {
  const today = zonedParts(now, 'Europe/Istanbul').isoDate;
  const current = academicYearOf(today);
  const targets = [current, ...(Number(today.slice(5, 7)) >= 6 ? [current + 1] : [])];
  for (const year of targets) {
    const [row] = await deps.db.select().from(academicCalendars).where(eq(academicCalendars.startYear, year));
    if (row && (row.source === 'meb' || row.source === 'manual')) continue;
    const last = row?.checkedAt?.getTime() ?? lastTry.get(year) ?? 0;
    if (now.getTime() - last < 20 * 3600_000) continue;
    lastTry.set(year, now.getTime());
    const result = await scanMebCalendar(deps, year, { now });
    if (result.outcome === 'not-found' && !row && today >= `${year}-08-25`) {
      await tellPlatform(deps, `meb-calendar:${year}:missing`, `${academicYearLabel(year)} çalışma takvimi bulunamadı`, "MEB duyurusu otomatik okunamadı. Ders Düzeni › Tatil Takvimi'nden tarihleri elle girin ya da duyuru adresini verin.");
    }
  }
}
