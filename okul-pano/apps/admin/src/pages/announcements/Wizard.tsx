import { announcementSchema, autoSlideSeconds, designTemplate, hasAdvancedPlan, PLAN_WEEKDAYS, planConflict, planSentence, presetEnd, UNTIL_PRESETS, untilChoiceOf, type UntilChoice, designTitle, parseYouTubeUrl, youTubeThumbnail, type AnnouncementDesign } from '@okulpano/shared';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import type { ModalApi } from '../../components/CrudPage.tsx';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Image as ImageIcon, LayoutTemplate, PlayCircle, Type } from '../../components/icons.tsx';
import { ImageUpload } from '../../components/ImageUpload.tsx';
import { Alert, Button, Field, Input, Modal, Textarea, Toggle } from '../../components/ui.tsx';
import { useList, useSchool, type Announcement, type AnnouncementSchedule, type Screen } from '../../lib/data.ts';
import { isoToLocalInput, localInputToIso } from '../../lib/format.ts';
import { DesignEditor, DesignThumb, emptyDesign } from './DesignEditor.tsx';
import { emptySchedule } from './ScheduleFields.tsx';

/*
 * Adım adım duyuru (tasarım A): Tür → İçerik → Nerede ve ne zaman → Kontrol ve gönder. Üstte adım çubuğu, 2. adımdan
 * sonra sağda panoda nasıl görüneceği (yalnızca ortadaki duyuru alanında; üst bar, yan kartlar ve kayan yazı yerinde).
 * Her adımda o adımın alanları doğrulanır. Var olan duyuru 4. adımdan (özet) açılır. Yeni duyuru yarıda kapanırsa
 * taslak olarak saklanır (Duyurular › Taslaklar).
 */

export type AnnouncementForm = {
  kind: 'image' | 'video' | 'text' | 'design';
  design: AnnouncementDesign;
  screenIds: string[];
  schedule: AnnouncementSchedule;
  title: string;
  body: string;
  imageUrl: string | null;
  youtubeUrl: string;
  durationSec: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

export const emptyAnnouncementForm = (): AnnouncementForm => ({
  kind: 'image',
  design: emptyDesign(),
  screenIds: [],
  schedule: emptySchedule(),
  title: '',
  body: '',
  imageUrl: null,
  youtubeUrl: '',
  durationSec: '',
  startsAt: '',
  // Varsayılan 1 hafta (süresiz unutulan duyurular panoda birikmesin); "Süresiz" seçilebilir
  endsAt: isoToLocalInput(presetEnd(7).toISOString()),
  isActive: true,
});

/** Şablonun bilgi satırları ve notu listede özet olarak görünür */
export function designBody(d: AnnouncementDesign): string | null {
  const t = designTemplate(d.template);
  const parts = [t.subline, ...t.info, t.note].map((f) => (f ? d.fields[f.key]?.trim() : '')).filter(Boolean);
  return parts.length ? parts.join(' · ').slice(0, 600) : null;
}

export function toAnnouncementPayload(f: AnnouncementForm) {
  return {
    kind: f.kind,
    // Şablonlu duyuruda başlık ve metin şablondaki alanlardan oluşur (listede ve geçmişte görünür)
    title: f.kind === 'design' ? designTitle(f.design) : f.title,
    body: f.kind === 'design' ? designBody(f.design) : f.body || null,
    design: f.kind === 'design' ? f.design : null,
    screenIds: f.screenIds.length ? f.screenIds : null,
    schedule: f.schedule,
    imageUrl: f.kind === 'image' ? f.imageUrl : null,
    youtubeUrl: f.kind === 'video' ? f.youtubeUrl : null,
    durationSec: f.durationSec ? Number(f.durationSec) : null,
    startsAt: localInputToIso(f.startsAt),
    endsAt: localInputToIso(f.endsAt),
    isActive: f.isActive,
  };
}

/** Taslağa değer mi: bir şey yazılmış ya da seçilmiş */
export const hasContent = (f: AnnouncementForm) =>
  Boolean(f.title.trim() || f.body.trim() || f.imageUrl || f.youtubeUrl.trim() || Object.values(f.design.fields).some((v) => v?.trim()));

export const KIND_LABEL: Record<AnnouncementForm['kind'], string> = { image: 'Görsel', video: 'YouTube', text: 'Metin', design: 'Hazır şablon' };
export const STEPS = ['Tür', 'İçerik', 'Nerede ve ne zaman', 'Kontrol ve gönder'] as const;
/** Doğrulama hatasının hangi adımda düzeltileceği */
const STEP_KEYS: string[][] = [['kind'], ['title', 'body', 'imageUrl', 'youtubeUrl', 'design'], ['screenIds', 'schedule', 'startsAt', 'endsAt', 'durationSec'], ['isActive']];

const KINDS: { value: AnnouncementForm['kind']; label: string; text: string; icon: typeof ImageIcon; tone: string }[] = [
  { value: 'image', label: 'Görsel', text: 'Fotoğraf ya da afiş', icon: ImageIcon, tone: 'bg-tile-sky text-tile-sky-ink' },
  { value: 'video', label: 'YouTube', text: 'Video bağlantısı', icon: PlayCircle, tone: 'bg-tile-rose text-tile-rose-ink' },
  { value: 'text', label: 'Metin', text: 'Başlık ve kısa yazı', icon: Type, tone: 'bg-tile-sun text-tile-sun-ink' },
  { value: 'design', label: 'Hazır şablon', text: 'Doldurup gönderin', icon: LayoutTemplate, tone: 'bg-tile-mint text-tile-mint-ink' },
];

export function AnnouncementWizard({
  api,
  startStep,
  onDismiss,
  onSaved,
  defaultDuration,
  maxDuration = 60,
  isApprover = false,
  approvalNeeded,
  isDirty = hasContent,
}: {
  api: ModalApi<Announcement, AnnouncementForm>;
  /** Yeni duyuruda 0, taslaktan devamda kaldığı adım; düzenlemede her zaman özet (3) */
  startStep: number;
  /** Kaydetmeden kapatma (taslak kaydı ya da düzenlemede uyarı burada); adım: ulaşılan en ileri adım */
  onDismiss: (values: AnnouncementForm, step: number) => void;
  /** Kayıt başarılı (taslaktan geldiyse taslak silinir) */
  onSaved: () => void;
  /** Kaybolacak bir şey var mı: sekme kapatılırken tarayıcının "Siteden ayrılınsın mı?" uyarısı için */
  isDirty?: (values: AnnouncementForm) => boolean;
  defaultDuration: number;
  /** Okulun üst sınırı: süresi girilmemiş duyuru metne göre en çok bu kadar kalır; elle daha uzunu onaya düşer */
  maxDuration?: number;
  /** Duyuru onaylama yetkisi: uzun süre onu onaya düşürmez */
  isApprover?: boolean;
  /** Okulda duyuru onayı açık ve kişinin onay yetkisi yok: son düğme "Onaya gönder" */
  approvalNeeded: boolean;
}) {
  const { open, editing, form, saving } = api;
  const v = form.values;
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  // Sekme kapatılırken ya da sayfa yenilenirken yazılanlar kaybolacaksa tarayıcı kendi uyarısını gösterir
  // (bu uyarıya kendi düğmelerimizi koyamayız; pencere içinden çıkışta ayrıca sorulur)
  const dirty = open && !saving && isDirty(v);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!open) return;
    const s = editing ? 3 : Math.min(3, Math.max(0, startStep));
    setStep(s);
    setReached(editing ? 3 : s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** İlk hatalı adım (yalnızca `upTo` dahil önceki adımlara bakılır); hatalar o adımın alanlarında gösterilir */
  const firstInvalid = (upTo: number): number => {
    const r = announcementSchema.safeParse(toAnnouncementPayload(v));
    if (r.success) return -1;
    const errs: Record<string, string> = {};
    for (const issue of r.error.issues) errs[String(issue.path[0] ?? '_form')] ??= issue.message;
    for (let s = 0; s <= upTo; s++) {
      const keys = STEP_KEYS[s]!.filter((k) => errs[k]);
      if (keys.length) {
        form.setErrors(Object.fromEntries(keys.map((k) => [k, errs[k]])));
        return s;
      }
    }
    return upTo >= 3 ? 3 : -1;
  };
  const go = (s: number) => {
    setStep(s);
    setReached((r) => Math.max(r, s));
  };
  const next = () => {
    const bad = firstInvalid(step);
    if (bad >= 0 && bad <= step) return setStep(bad);
    // Birbirini dışlayan plan (duyuru hiç görünmez): uyarı bu adımda görünür, düzeltilmeden ilerlenmez
    if (step === 2 && planConflict(v.startsAt || null, v.endsAt || null, v.schedule)) return;
    go(step + 1);
  };
  const finish = async () => {
    const bad = firstInvalid(2);
    if (bad >= 0) return setStep(bad);
    if (await api.submit()) onSaved();
  };

  // Üst sınırdan uzun ekranda kalma süresi onay yetkisi olmayanda onaya düşer (sunucu da aynı kuralı uygular)
  const tooLong = !isApprover && Number(v.durationSec) > maxDuration;
  const needsApproval = approvalNeeded || tooLong;
  const submitLabel = editing ? (needsApproval ? 'Onaya gönder' : 'Kaydet') : !v.isActive ? 'Kaydet (yayında değil)' : needsApproval ? 'Onaya gönder' : 'Yayına al';

  return (
    <Modal
      open={open}
      onClose={() => onDismiss(v, reached)}
      title={editing ? 'Duyuruyu düzenle' : 'Yeni duyuru'}
      size="xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {step === 0 ? (
            <Button variant="ghost" onClick={() => onDismiss(v, reached)}>
              Vazgeç
            </Button>
          ) : (
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(step - 1)}>
              Geri
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={next}>
              Devam: {STEPS[step + 1]} <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button loading={saving} onClick={() => void finish()}>
              {submitLabel}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <Stepper step={step} reached={reached} onPick={go} />
        {form.errors._form && <Alert tone="red">{form.errors._form}</Alert>}
        {step === 0 && <KindStep value={v.kind} onPick={(k) => form.set('kind', k)} />}
        {step > 0 && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-4">
              {step === 1 && <ContentStep api={api} />}
              {step === 2 && <WhereWhenStep api={api} defaultDuration={defaultDuration} maxDuration={maxDuration} isApprover={isApprover} />}
              {step === 3 && <SummaryStep api={api} defaultDuration={defaultDuration} maxDuration={maxDuration} onEdit={go} />}
            </div>
            <MiniBoard f={v} />
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Üstteki adım çubuğu: geçilmiş adımlara dokununca o adıma dönülür */
function Stepper({ step, reached, onPick }: { step: number; reached: number; onPick: (s: number) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-slate-100 pb-4">
      {STEPS.map((label, i) => {
        const done = i < step;
        const on = i === step;
        const can = i <= reached && !on;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!can}
              onClick={() => onPick(i)}
              aria-current={on ? 'step' : undefined}
              className={clsx('flex items-center gap-2 text-sm font-bold whitespace-nowrap', on ? 'text-ink' : done ? 'text-brand-700' : 'text-slate-400', can && 'hover:underline')}
            >
              <span
                className={clsx(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold',
                  on ? 'bg-ink text-surface' : done ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-500',
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className={clsx('hidden h-0.5 flex-1 rounded sm:block', i < step ? 'bg-brand-700' : 'bg-slate-200')} />}
          </li>
        );
      })}
    </ol>
  );
}

function KindStep({ value, onPick }: { value: AnnouncementForm['kind']; onPick: (k: AnnouncementForm['kind']) => void }) {
  return (
    <div>
      <p className="mb-3 text-base font-bold text-ink">Ne tür bir duyuru ekliyorsunuz?</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => onPick(k.value)}
            aria-pressed={value === k.value}
            className={clsx('rounded-2xl p-4 text-left ring-1 transition', value === k.value ? 'ring-2 ring-ink' : 'ring-slate-200 hover:ring-slate-300')}
          >
            <span className={clsx('flex size-10 items-center justify-center rounded-xl', k.tone)}>
              <k.icon className="size-5" />
            </span>
            <span className="mt-2 block font-bold text-ink">{k.label}</span>
            <span className="block text-sm text-slate-500">{k.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ContentStep({ api }: { api: ModalApi<Announcement, AnnouncementForm> }) {
  const { values: v, set, errors } = api.form;
  const yt = v.youtubeUrl ? parseYouTubeUrl(v.youtubeUrl) : null;
  return (
    <>
      {v.kind === 'design' && <DesignEditor value={v.design} onChange={(d) => set('design', d)} />}
      {v.kind === 'design' && errors.title && <Alert tone="red">Şablonun başlık alanını doldurun.</Alert>}

      {v.kind === 'image' && (
        <div>
          <ImageUpload value={v.imageUrl} onChange={(url) => set('imageUrl', url)} invalid={Boolean(errors.imageUrl)} />
          {errors.imageUrl && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.imageUrl}</p>}
        </div>
      )}

      {v.kind === 'video' && (
        <Field label="YouTube bağlantısı" error={errors.youtubeUrl} help="youtube.com/watch, youtu.be ve Shorts bağlantıları desteklenir. Video bitince sıradaki slayta geçilir.">
          {(id) => (
            <div className="space-y-3">
              <Input id={id} value={v.youtubeUrl} onChange={(e) => set('youtubeUrl', e.target.value)} placeholder="https://www.youtube.com/watch?v=…" invalid={Boolean(errors.youtubeUrl)} />
              {yt && <img src={youTubeThumbnail(yt.id)} alt="Video önizlemesi" className="aspect-video w-full rounded-xl object-cover ring-1 ring-slate-200" />}
            </div>
          )}
        </Field>
      )}

      {v.kind !== 'design' && (
        <>
          <Field label="Başlık" error={errors.title}>
            {(id) => <Input id={id} value={v.title} onChange={(e) => set('title', e.target.value)} maxLength={120} placeholder="ör. Bilim Fuarı Başvuruları Başladı" invalid={Boolean(errors.title)} />}
          </Field>
          <Field label={v.kind === 'text' ? 'Duyuru metni' : 'Açıklama (isteğe bağlı)'} error={errors.body} help={`${v.body.length}/600 · Koridordan okunabilmesi için kısa tutun.`}>
            {(id) => <Textarea id={id} value={v.body} onChange={(e) => set('body', e.target.value)} maxLength={600} rows={3} />}
          </Field>
        </>
      )}
    </>
  );
}

/** Süresi girilmemiş duyurunun panodaki süresi: metnin okunma süresi (okul varsayılanı ile üst sınır arasında) */
function autoDuration(v: AnnouncementForm, defaultDuration: number, maxDuration: number): number {
  return autoSlideSeconds({ title: v.kind === 'design' ? '' : v.title, body: v.kind === 'design' ? '' : v.body, design: v.kind === 'design' ? v.design : null }, defaultDuration, maxDuration);
}

const pill = (on: boolean) =>
  clsx(
    'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold ring-1 transition',
    on ? 'bg-ink text-surface ring-ink' : 'bg-surface text-slate-700 ring-slate-300 hover:ring-slate-400',
  );

/**
 * "Nerede ve ne zaman" (tasarım A): üç kısa soru hazır seçeneklerle (Nerede · Ne zamana kadar · Ekranda kalma);
 * başlangıç, günler, saatler ve zil durumu "Gelişmiş zamanlama"nın altında. Altta ne olacağını anlatan tek cümle.
 * Mobil uygulamayla aynı kurallar (@okulpano/shared/announcementPlan).
 */
function WhereWhenStep({ api, defaultDuration, maxDuration, isApprover }: { api: ModalApi<Announcement, AnnouncementForm>; defaultDuration: number; maxDuration: number; isApprover: boolean }) {
  const { values: v, set, errors } = api.form;
  const screens = useList<Screen>('screens');
  const names = v.screenIds.map((id) => screens.data?.find((s) => s.id === id)?.name ?? '?');
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const endDate = v.endsAt ? new Date(v.endsAt) : null;
  const [until, setUntil] = useState<UntilChoice>(() => untilChoiceOf(endDate));
  const [advanced, setAdvanced] = useState(() => hasAdvancedPlan(v.startsAt || null, v.schedule));
  const [manualDuration, setManualDuration] = useState(() => Boolean(v.durationSec) && ![20, 30, 45, 60].includes(Number(v.durationSec)));
  const auto = autoDuration(v, defaultDuration, maxDuration);
  const conflict = planConflict(v.startsAt || null, v.endsAt || null, v.schedule);
  const tooLong = !isApprover && Number(v.durationSec) > maxDuration;
  const chooseUntil = (c: UntilChoice) => {
    setUntil(c);
    const preset = UNTIL_PRESETS.find((p) => p.key === c);
    if (preset) set('endsAt', isoToLocalInput(presetEnd(preset.days).toISOString()));
    if (c === 'none') set('endsAt', '');
    if (c === 'date' && !v.endsAt) set('endsAt', isoToLocalInput(presetEnd(7).toISOString()));
  };
  const s = v.schedule;
  return (
    <div className="space-y-5">
      {(screens.data?.length ?? 0) > 0 && (
        <div>
          <div className="mb-2 text-sm font-extrabold text-ink">Nerede</div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={pill(!v.screenIds.length)} onClick={() => set('screenIds', [])}>
              {!v.screenIds.length && <Check className="size-3.5" />}Bütün panolar
            </button>
            {screens.data!.map((x) => (
              <button key={x.id} type="button" className={pill(v.screenIds.includes(x.id))} onClick={() => set('screenIds', toggle(v.screenIds, x.id))}>
                {v.screenIds.includes(x.id) && <Check className="size-3.5" />}
                {x.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-sm font-extrabold text-ink">Ne zamana kadar</div>
        <div className="flex flex-wrap gap-1.5">
          {UNTIL_PRESETS.map((p) => (
            <button key={p.key} type="button" className={pill(until === p.key)} onClick={() => chooseUntil(p.key)}>
              {until === p.key && <Check className="size-3.5" />}
              {p.label}
            </button>
          ))}
          <button type="button" className={pill(until === 'none')} onClick={() => chooseUntil('none')}>
            {until === 'none' && <Check className="size-3.5" />}Süresiz
          </button>
          <button type="button" className={pill(until === 'date')} onClick={() => chooseUntil('date')}>
            <CalendarDays className="size-3.5" />
            Tarih seç
          </button>
        </div>
        {until === 'date' && (
          <div className="mt-3 max-w-72">
            <Field label="Yayından kalkacağı an" error={errors.endsAt}>
              {(id) => <Input id={id} type="datetime-local" value={v.endsAt} onChange={(e) => set('endsAt', e.target.value)} invalid={Boolean(errors.endsAt)} />}
            </Field>
          </div>
        )}
      </div>

      {v.kind !== 'video' ? (
        <div>
          <div className="mb-2 flex items-baseline gap-2 text-sm font-extrabold text-ink">
            Ekranda kalma <span className="text-xs font-semibold text-slate-500">her gösterimde</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={pill(!v.durationSec && !manualDuration)} onClick={() => (setManualDuration(false), set('durationSec', ''))}>
              {!v.durationSec && !manualDuration && <Check className="size-3.5" />}Otomatik · {auto} sn
            </button>
            {[20, 30, 45, 60].map((n) => (
              <button key={n} type="button" className={pill(!manualDuration && Number(v.durationSec) === n)} onClick={() => (setManualDuration(false), set('durationSec', String(n)))}>
                {!manualDuration && Number(v.durationSec) === n && <Check className="size-3.5" />}
                {n} sn
              </button>
            ))}
            <button type="button" className={pill(manualDuration)} onClick={() => setManualDuration(true)}>
              Elle gir
            </button>
          </div>
          {manualDuration && (
            <div className="mt-3 max-w-56">
              <Field label="Saniye" error={errors.durationSec}>
                {(id) => <Input id={id} type="number" min={3} max={300} value={v.durationSec} onChange={(e) => set('durationSec', e.target.value)} placeholder={`Otomatik (${auto})`} />}
              </Field>
            </div>
          )}
          <p className={clsx('mt-2 text-xs font-semibold', tooLong ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500')}>
            {tooLong
              ? `${maxDuration} saniyeden uzun süre onaylayıcının onayına düşer; onaylanınca yayına girer.`
              : `Otomatik: kısa duyuru ${defaultDuration} sn kalır, uzun duyuru metne göre uzar (en çok ${maxDuration} sn).`}
          </p>
        </div>
      ) : (
        <p className="text-sm font-semibold text-slate-500">Video duyurusu panoda video bitene kadar kalır.</p>
      )}

      <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
        <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((x) => !x)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
          <span className="flex-1">
            <span className="block text-sm font-extrabold text-ink">Gelişmiş zamanlama</span>
            <span className="block text-xs font-semibold text-slate-500">Başlangıç tarihi, haftanın günleri, saat aralığı, yalnızca teneffüste</span>
          </span>
          <ChevronDown className={clsx('size-4 text-slate-400 transition-transform', !advanced && '-rotate-90')} />
        </button>
        {advanced && (
          <div className="space-y-4 border-t border-slate-100 px-4 py-4">
            <div className="max-w-72">
              <Field label="Yayın başlangıcı" help="Boşsa hemen">
                {(id) => <Input id={id} type="datetime-local" value={v.startsAt} onChange={(e) => set('startsAt', e.target.value)} />}
              </Field>
            </div>
            <Field label="Haftanın günleri" help="Hiçbiri seçili değilse her gün">
              {() => (
                <div className="flex flex-wrap gap-1.5">
                  {PLAN_WEEKDAYS.map((d, i) => (
                    <button key={d} type="button" className={pill(s.days.includes(i + 1))} onClick={() => set('schedule', { ...s, days: toggle(s.days, i + 1).sort() })}>
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <div className="grid max-w-md gap-4 sm:grid-cols-2">
              <Field label="Günün şu saatinden" error={errors.schedule}>
                {(id) => <Input id={id} type="time" value={s.from ?? ''} onChange={(e) => set('schedule', { ...s, from: e.target.value || null })} />}
              </Field>
              <Field label="şu saatine kadar">
                {(id) => <Input id={id} type="time" value={s.to ?? ''} onChange={(e) => set('schedule', { ...s, to: e.target.value || null })} />}
              </Field>
            </div>
            <Field label="Zil durumu">
              {() => (
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['any', 'Her zaman'],
                      ['break', 'Yalnızca teneffüste'],
                      ['lesson', 'Yalnızca derste'],
                    ] as const
                  ).map(([value, label]) => (
                    <button key={value} type="button" className={pill(s.phase === value)} onClick={() => set('schedule', { ...s, phase: value })}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </Field>
          </div>
        )}
      </div>

      <div className={clsx('rounded-2xl px-4 py-3 text-sm font-bold', conflict ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-slate-50 text-ink ring-1 ring-slate-200')}>
        {conflict ?? planSentence(v.startsAt || null, v.endsAt || null, s, names)}
        {!conflict && v.kind !== 'video' && (
          <span className="mt-0.5 block text-xs font-semibold text-slate-500">
            Her gösterimde {v.durationSec ? `${v.durationSec} saniye` : `${auto} saniye (metnin uzunluğuna göre)`} ekranda kalır.
          </span>
        )}
      </div>
    </div>
  );
}

function SummaryStep({ api, defaultDuration, maxDuration, onEdit }: { api: ModalApi<Announcement, AnnouncementForm>; defaultDuration: number; maxDuration: number; onEdit: (step: number) => void }) {
  const { values: v, set } = api.form;
  const screens = useList<Screen>('screens');
  const names = v.screenIds.map((id) => screens.data?.find((s) => s.id === id)?.name ?? '?');
  const title = v.kind === 'design' ? designTitle(v.design) : v.title;
  const rows: { label: string; value: string; step: number }[] = [
    { label: 'Tür', value: KIND_LABEL[v.kind], step: 0 },
    { label: 'Başlık', value: title || '—', step: 1 },
    { label: 'Yayın planı', value: planConflict(v.startsAt || null, v.endsAt || null, v.schedule) ?? planSentence(v.startsAt || null, v.endsAt || null, v.schedule, names), step: 2 },
    { label: 'Ekranda kalma süresi', value: v.durationSec ? `${v.durationSec} sn` : v.kind === 'video' ? 'Video süresi' : `Otomatik, metne göre (${autoDuration(v, defaultDuration, maxDuration)} sn)`, step: 2 },
  ];
  return (
    <>
      <dl className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-3 px-4 py-3 text-sm">
            <dt className="w-40 shrink-0 text-slate-500">{r.label}</dt>
            <dd className="min-w-0 flex-1 font-semibold text-ink">{r.value}</dd>
            <button type="button" onClick={() => onEdit(r.step)} className="shrink-0 font-bold text-brand-700 hover:underline">
              Değiştir
            </button>
          </div>
        ))}
      </dl>
      <Toggle checked={v.isActive} onChange={(x) => set('isActive', x)} label="Yayında" description="Kapalıysa duyuru saklanır ama panoda gösterilmez." />
    </>
  );
}

/**
 * Panoda nasıl görüneceği (yaklaşık): duyuru yalnızca ortadaki alanda; üst bar, yan kartlar ve kayan yazı yerinde kalır.
 */
export function MiniBoard({ f }: { f: AnnouncementForm }) {
  const school = useSchool();
  const yt = f.kind === 'video' && f.youtubeUrl ? parseYouTubeUrl(f.youtubeUrl) : null;
  const title = (f.kind === 'design' ? designTitle(f.design) : f.title) || 'Duyuru başlığı';
  const now = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
  const bg = f.kind === 'image' ? f.imageUrl : yt ? youTubeThumbnail(yt.id) : null;
  return (
    <div className="self-start rounded-2xl bg-slate-100 p-3">
      <div className="mb-2 text-[11px] font-extrabold tracking-wider text-slate-500 uppercase">Panoda nasıl görünecek</div>
      {/* Pano renkleri temadan bağımsızdır (panonun kendisi gibi) */}
      <div className="grid aspect-video grid-rows-[12%_1fr_9%] gap-1 rounded-lg p-1.5" style={{ background: '#0f172a' }}>
        <div className="flex items-center justify-between rounded px-2 text-[8px] font-bold" style={{ background: '#1e293b', color: '#cbd5e1' }}>
          <span className="truncate">{school.data?.name ?? 'Okul'}</span>
          <span>{now}</span>
        </div>
        <div className="grid min-h-0 grid-cols-[22%_1fr_22%] gap-1">
          <div className="rounded" style={{ background: '#1e293b' }} />
          <div className="relative min-h-0 overflow-hidden rounded-md outline-2 outline-offset-1 outline-amber-400">
            {f.kind === 'design' ? (
              <div className="flex size-full items-center justify-center" style={{ background: '#1e293b' }}>
                <DesignThumb design={f.design} className="w-full" />
              </div>
            ) : (
              <div className="relative flex size-full flex-col justify-end p-1.5" style={{ color: '#fff', background: bg ? '#000' : 'linear-gradient(135deg,#0E5E66,#14b8a6)' }}>
                {bg && <img src={bg} alt="" className="absolute inset-0 size-full object-cover" />}
                {bg && <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.7), transparent)' }} />}
                {f.kind === 'video' && <PlayCircle className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 drop-shadow" style={{ color: '#fff' }} />}
                <b className="relative line-clamp-2 text-[10px] leading-tight">{title}</b>
                {f.body && f.kind !== 'video' && <span className="relative line-clamp-2 text-[8px] opacity-85">{f.body}</span>}
              </div>
            )}
          </div>
          <div className="rounded" style={{ background: '#1e293b' }} />
        </div>
        <div className="flex items-center rounded px-2 text-[7.5px]" style={{ background: '#b91c1c', color: '#fff' }}>
          Kayan yazı…
        </div>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-slate-500">Duyuru yalnızca ortadaki alanda gösterilir; üst bar, yan kartlar ve kayan yazı yerinde kalır.</p>
    </div>
  );
}
