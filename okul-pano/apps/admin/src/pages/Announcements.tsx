import { announcementSchema, parseYouTubeUrl, youTubeThumbnail } from '@okulpano/shared';
import { Image as ImageIcon, Megaphone, PlayCircle, Type } from 'lucide-react';
import { CrudPage } from '../components/CrudPage.tsx';
import { ImageUpload } from '../components/ImageUpload.tsx';
import { Badge, Field, Input, Segmented, Textarea, Toggle } from '../components/ui.tsx';
import { useSchool, type Announcement } from '../lib/data.ts';
import { formatDateTime, isoToLocalInput, localInputToIso, publishState } from '../lib/format.ts';

type Form = {
  kind: 'image' | 'video' | 'text';
  title: string;
  body: string;
  imageUrl: string | null;
  youtubeUrl: string;
  durationSec: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const empty = (): Form => ({
  kind: 'image',
  title: '',
  body: '',
  imageUrl: null,
  youtubeUrl: '',
  durationSec: '',
  startsAt: '',
  endsAt: '',
  isActive: true,
});

export function StateBadge({ row }: { row: { isActive: boolean; startsAt: string | null; endsAt: string | null } }) {
  const state = publishState(row);
  if (state === 'live') return <Badge tone="green" dot>Yayında</Badge>;
  if (state === 'scheduled') return <Badge tone="blue">Planlandı · {formatDateTime(row.startsAt)}</Badge>;
  if (state === 'expired') return <Badge tone="slate">Süresi doldu</Badge>;
  return <Badge tone="slate">Pasif</Badge>;
}

/** Yayın durumu ve bitiş tarihi tek hücrede */
export function PublishCell({ row }: { row: { isActive: boolean; startsAt: string | null; endsAt: string | null } }) {
  return (
    <div className="space-y-1">
      <StateBadge row={row} />
      <div className="text-xs whitespace-nowrap text-slate-500">{row.endsAt ? `Bitiş: ${formatDateTime(row.endsAt)}` : 'Süresiz'}</div>
    </div>
  );
}

function Thumb({ row }: { row: Announcement }) {
  const yt = row.youtubeUrl ? parseYouTubeUrl(row.youtubeUrl) : null;
  const src = row.kind === 'image' ? row.imageUrl : yt ? youTubeThumbnail(yt.id) : null;
  return (
    <div className="relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
      {src ? <img src={src} alt="" className="size-full object-cover" loading="lazy" /> : <Megaphone className="size-5 text-slate-400" />}
      {row.kind === 'video' && <PlayCircle className="absolute size-7 text-white drop-shadow" />}
    </div>
  );
}

const KIND_LABEL = { image: 'Görsel', video: 'Video', text: 'Metin' };

export function Announcements() {
  const school = useSchool();
  const defaultDuration = school.data?.settings.slideDurationSec ?? 10;

  return (
    <CrudPage<Announcement, Form>
      resource="announcements"
      label="Duyuru"
      title="Duyurular"
      description="Panonun orta alanında slayt olarak dönen görselli, videolu ve metin duyurular. Sırayı oklarla değiştirebilir, yayın tarihi vererek önceden planlayabilirsiniz."
      permission="announcements.manage"
      icon={<Megaphone className="size-6" />}
      emptyTitle="Henüz duyuru yok"
      emptyText="İlk duyurunuzu ekleyin; kaydettiğiniz anda tüm ekranlarda görünür."
      addLabel="Yeni duyuru"
      activeToggle
      reorderable
      modalSize="lg"
      schema={announcementSchema}
      columns={[
        {
          header: 'Duyuru',
          cell: (r) => (
            <div className="flex items-center gap-3">
              <Thumb row={r} />
              <div className="min-w-0">
                <div className="max-w-[20rem] truncate font-semibold text-slate-900">{r.title}</div>
                {r.body && <div className="max-w-[20rem] truncate text-slate-500">{r.body}</div>}
              </div>
            </div>
          ),
        },
        { header: 'Tür', cell: (r) => <span className="text-slate-600">{KIND_LABEL[r.kind]}</span> },
        { header: 'Durum', cell: (r) => <PublishCell row={r} /> },
      ]}
      emptyForm={empty}
      toForm={(r) => ({
        kind: r.kind,
        title: r.title,
        body: r.body ?? '',
        imageUrl: r.imageUrl,
        youtubeUrl: r.youtubeUrl ?? '',
        durationSec: r.durationSec ? String(r.durationSec) : '',
        startsAt: isoToLocalInput(r.startsAt),
        endsAt: isoToLocalInput(r.endsAt),
        isActive: r.isActive,
      })}
      toPayload={(f) => ({
        kind: f.kind,
        title: f.title,
        body: f.body || null,
        imageUrl: f.kind === 'image' ? f.imageUrl : null,
        youtubeUrl: f.kind === 'video' ? f.youtubeUrl : null,
        durationSec: f.durationSec ? Number(f.durationSec) : null,
        startsAt: localInputToIso(f.startsAt),
        endsAt: localInputToIso(f.endsAt),
        isActive: f.isActive,
      })}
      renderForm={({ values: v, set, errors }) => {
        const yt = v.youtubeUrl ? parseYouTubeUrl(v.youtubeUrl) : null;
        return (
          <>
            <Segmented
              value={v.kind}
              onChange={(k) => set('kind', k)}
              options={[
                { value: 'image', label: <span className="flex items-center gap-1.5"><ImageIcon className="size-4" /> Görsel</span> },
                { value: 'video', label: <span className="flex items-center gap-1.5"><PlayCircle className="size-4" /> YouTube</span> },
                { value: 'text', label: <span className="flex items-center gap-1.5"><Type className="size-4" /> Metin</span> },
              ]}
            />

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
                    <Input
                      id={id}
                      value={v.youtubeUrl}
                      onChange={(e) => set('youtubeUrl', e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=…"
                      invalid={Boolean(errors.youtubeUrl)}
                    />
                    {yt && (
                      <img src={youTubeThumbnail(yt.id)} alt="Video önizlemesi" className="aspect-video w-full rounded-xl object-cover ring-1 ring-slate-200" />
                    )}
                  </div>
                )}
              </Field>
            )}

            <Field label="Başlık" error={errors.title}>
              {(id) => (
                <Input id={id} value={v.title} onChange={(e) => set('title', e.target.value)} maxLength={120} placeholder="ör. Bilim Fuarı Başvuruları Başladı" invalid={Boolean(errors.title)} />
              )}
            </Field>

            <Field label={v.kind === 'text' ? 'Duyuru metni' : 'Açıklama (isteğe bağlı)'} error={errors.body} help={`${v.body.length}/600 · Koridordan okunabilmesi için kısa tutun.`}>
              {(id) => <Textarea id={id} value={v.body} onChange={(e) => set('body', e.target.value)} maxLength={600} rows={3} />}
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Gösterim süresi (sn)" error={errors.durationSec}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={3}
                    max={1800}
                    value={v.durationSec}
                    onChange={(e) => set('durationSec', e.target.value)}
                    placeholder={v.kind === 'video' ? 'Video süresi' : `Varsayılan (${defaultDuration})`}
                  />
                )}
              </Field>
              <Field label="Yayın başlangıcı" error={errors.startsAt}>
                {(id) => <Input id={id} type="datetime-local" value={v.startsAt} onChange={(e) => set('startsAt', e.target.value)} />}
              </Field>
              <Field label="Yayın bitişi" error={errors.endsAt}>
                {(id) => <Input id={id} type="datetime-local" value={v.endsAt} onChange={(e) => set('endsAt', e.target.value)} invalid={Boolean(errors.endsAt)} />}
              </Field>
            </div>

            <Toggle checked={v.isActive} onChange={(x) => set('isActive', x)} label="Yayında" description="Kapalıysa duyuru saklanır ama panoda gösterilmez." />
          </>
        );
      }}
    />
  );
}
