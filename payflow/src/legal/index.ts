import controller from '../../legal/controller.json';
import documents from '../../legal/documents.json';

/**
 * Yasal metinler — tek kaynak `payflow/legal/*.json`.
 * Uygulama içi ekran ve web sayfaları (scripts/build-legal.mjs) aynı içerikten üretilir.
 */
export type LegalDocId = 'privacy' | 'terms';
export type LegalBlock = { p: string } | { ul: string[] };
export interface LegalSection {
  id: string;
  heading: string;
  blocks: LegalBlock[];
}
export interface LegalDoc {
  slug: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}

/** Web sayfalarının yayınlanacağı adres (GitHub Pages). */
export const LEGAL_BASE_URL = 'https://ertan88.github.io/antigravity-web-design-skills/payflow';

const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String((controller as Record<string, string>)[k] ?? `{{${k}}}`));

export function legalDoc(id: LegalDocId): LegalDoc {
  const d = (documents as Record<LegalDocId, LegalDoc>)[id];
  return {
    slug: d.slug,
    title: fill(d.title),
    intro: fill(d.intro),
    sections: d.sections.map((s) => ({
      id: s.id,
      heading: fill(s.heading),
      blocks: s.blocks.map((b) => ('p' in b ? { p: fill(b.p) } : { ul: b.ul.map(fill) })),
    })),
  };
}

export const legalUrl = (id: LegalDocId, anchor?: string) => `${LEGAL_BASE_URL}/${(documents as Record<LegalDocId, LegalDoc>)[id].slug}.html${anchor ? `#${anchor}` : ''}`;

/** Veri sorumlusu bilgileri doldurulmadıysa true (yayın öncesi kontrol). */
export const legalHasPlaceholders = () => Object.values(controller).some((v) => typeof v === 'string' && /^\[.*\]$/.test(v));
