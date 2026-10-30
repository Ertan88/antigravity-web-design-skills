import { ANNOUNCEMENT_TEMPLATES, DESIGN_PALETTE_IDS, DESIGN_PALETTES, designFields, designTemplate, type AnnouncementDesign } from '@okulpano/shared';
import { DesignSlide } from '@okulpano/slides';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { ImageUpload } from '../../components/ImageUpload.tsx';
import { Field, Input, Textarea } from '../../components/ui.tsx';
import { useSchool } from '../../lib/data.ts';

export const emptyDesign = (): AnnouncementDesign => ({ template: 'parents', palette: 'petrol', fields: {} });

/** Küçük, oranı korunmuş slayt önizlemesi */
export function DesignThumb({ design, sample, className }: { design: AnnouncementDesign; sample?: boolean; className?: string }) {
  const school = useSchool();
  return (
    <div className={clsx('aspect-video overflow-hidden', className)}>
      <DesignSlide design={design} sample={sample} schoolName={school.data?.name} schoolType={school.data?.settings.schoolType} logoUrl={school.data?.logoUrl} />
    </div>
  );
}

/**
 * Hazır şablon tasarımcısı: şablonu ve rengi seç, metinleri yaz; slayt canlı önizlemede oluşur.
 * Panoda da birebir aynı bileşen kullanılır.
 */
export function DesignEditor({ value, onChange }: { value: AnnouncementDesign; onChange: (d: AnnouncementDesign) => void }) {
  const t = designTemplate(value.template);
  const setField = (key: string, v: string) => onChange({ ...value, fields: { ...value.fields, [key]: v } });

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-sm font-medium text-slate-700">Şablon</div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {/* Ayın öğrencisi ve başarı şablonları Başarılar sayfasında; eski bir duyuruda seçiliyse yine görünür */}
          {[...ANNOUNCEMENT_TEMPLATES, ...(ANNOUNCEMENT_TEMPLATES.some((t) => t.id === value.template) ? [] : [designTemplate(value.template)])].map((x) => {
            const active = x.id === value.template;
            return (
              <button
                key={x.id}
                type="button"
                // Şablon değişince o şablonun önerilen rengi gelir; yazılan metinler korunur
                onClick={() => onChange({ ...value, template: x.id, palette: x.palette })}
                className={clsx(
                  'group overflow-hidden rounded-xl text-left ring-1 transition',
                  active ? 'ring-2 ring-brand-500' : 'ring-slate-200 hover:ring-slate-300',
                )}
              >
                <div className="pointer-events-none">
                  <DesignThumb design={{ template: x.id, palette: x.palette, fields: {} }} sample />
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-ink">
                  {active && <Check className="size-3.5 text-brand-600" />}
                  {x.name}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          {designFields(t).map((f) => (
            <Field key={f.key} label={f.label} help={f.multiline ? `${(value.fields[f.key] ?? '').length}/${f.max}` : undefined}>
              {(id) =>
                f.type === 'image' ? (
                  <ImageUpload
                    value={value.fields[f.key] || null}
                    onChange={(url) => setField(f.key, url ?? '')}
                    aspect="aspect-square max-w-36"
                    hint="Kare fotoğraf · velinin izni alınmış olsun (KVKK)"
                  />
                ) : f.multiline ? (
                  <Textarea id={id} rows={2} maxLength={f.max} value={value.fields[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setField(f.key, e.target.value)} />
                ) : (
                  <Input id={id} maxLength={f.max} value={value.fields[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setField(f.key, e.target.value)} />
                )
              }
            </Field>
          ))}
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">Renk</div>
            <div className="flex flex-wrap gap-2">
              {DESIGN_PALETTE_IDS.map((id) => {
                const p = DESIGN_PALETTES[id];
                return (
                  <button
                    key={id}
                    type="button"
                    title={p.name}
                    aria-label={p.name}
                    onClick={() => onChange({ ...value, palette: id })}
                    className={clsx('size-9 rounded-full ring-offset-2 ring-offset-surface transition', value.palette === id ? 'ring-2 ring-brand-500' : 'ring-1 ring-slate-200')}
                    style={{ background: `linear-gradient(135deg, ${p.from} 0 55%, ${p.accent} 55% 100%)` }}
                  />
                );
              })}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Önizleme</div>
          <div className="sticky top-2 overflow-hidden rounded-xl shadow-lg ring-1 ring-slate-200">
            <DesignThumb design={value} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Panoda birebir böyle görünür. Boş bıraktığınız satırlar slayta eklenmez.</p>
        </div>
      </div>
    </div>
  );
}
