import { announcementSchema, designTemplate, designTitle, parseYouTubeUrl, youTubeThumbnail } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Megaphone, PlayCircle, ScanEye } from '../components/icons.tsx';
import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { choose } from '../components/confirm.tsx';
import { CrudPage } from '../components/CrudPage.tsx';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Card, DeleteButton, EmptyState, Segmented } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useSchool, useSchoolPath, type Announcement, type Screen } from '../lib/data.ts';
import { expiredRowState, formatDateTime, isoToLocalInput, publishState, sortByPublish } from '../lib/format.ts';
import { DesignThumb, emptyDesign } from './announcements/DesignEditor.tsx';
import { ReviewDialog } from './announcements/ReviewDialog.tsx';
import { emptySchedule, scheduleSummary } from './announcements/ScheduleFields.tsx';
import { AnnouncementWizard, emptyAnnouncementForm, hasContent, KIND_LABEL as FORM_KIND_LABEL, STEPS, toAnnouncementPayload, type AnnouncementForm } from './announcements/Wizard.tsx';

type Form = AnnouncementForm;
const empty = emptyAnnouncementForm;

/** Yarım kalan duyuru (yalnızca giren kişiye görünür) */
interface Draft {
  id: string;
  step: number;
  data: Partial<Form>;
  updatedAt: string;
}

const toForm = (r: Announcement): Form => ({
  kind: r.kind,
  design: r.design ?? emptyDesign(),
  screenIds: r.screenIds ?? [],
  schedule: r.schedule ?? emptySchedule(),
  title: r.title,
  body: r.body ?? '',
  imageUrl: r.imageUrl,
  youtubeUrl: r.youtubeUrl ?? '',
  durationSec: r.durationSec ? String(r.durationSec) : '',
  startsAt: isoToLocalInput(r.startsAt),
  endsAt: isoToLocalInput(r.endsAt),
  isActive: r.isActive,
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
  if (row.kind === 'design' && row.design) {
    return <DesignThumb design={row.design} className="w-28 shrink-0 rounded-lg ring-1 ring-slate-200" />;
  }
  const yt = row.youtubeUrl ? parseYouTubeUrl(row.youtubeUrl) : null;
  const src = row.kind === 'image' ? row.imageUrl : yt ? youTubeThumbnail(yt.id) : null;
  return (
    <div className="relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
      {src ? <img src={src} alt="" className="size-full object-cover" loading="lazy" /> : <Megaphone className="size-5 text-slate-400" />}
      {row.kind === 'video' && <PlayCircle className="absolute size-7 text-white drop-shadow" />}
    </div>
  );
}

const KIND_LABEL = { image: 'Görsel', video: 'Video', text: 'Metin', design: 'Şablon' };

export function ApprovalBadge({ row }: { row: Announcement }) {
  if (row.approvalStatus === 'pending') return <Badge tone="amber">Onay bekliyor</Badge>;
  if (row.approvalStatus === 'rejected')
    return (
      <span className="space-y-0.5">
        <Badge tone="red">Düzeltme istendi</Badge>
        {row.reviewNote && <span className="block max-w-[14rem] truncate text-xs text-red-600">{row.reviewNote}</span>}
      </span>
    );
  return null;
}

export function Announcements() {
  const school = useSchool();
  const { can } = useAuth();
  const defaultDuration = school.data?.settings.slideDurationSec ?? 10;
  const screens = useList<Screen>('screens');
  const all = useList<Announcement>('announcements');
  const approver = can('announcements.approve');
  const [params, setParams] = useSearchParams();
  const reviewing = (all.data ?? []).find((a) => a.id === params.get('incele')) ?? null;
  const openReview = (id: string) => setParams({ incele: id });
  const closeReview = () => setParams({}, { replace: true });
  const pendingCount = (all.data ?? []).filter((a) => a.approvalStatus === 'pending').length;
  const [filter, setFilter] = useState<'all' | 'pending' | 'drafts'>('all');
  const { schoolId, me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const draftsPath = useSchoolPath('announcement-drafts');
  const drafts = useQuery({ queryKey: [schoolId, 'announcement-drafts'], queryFn: () => api<Draft[]>(draftsPath), enabled: can('announcements.manage') });
  const refreshDrafts = () => qc.invalidateQueries({ queryKey: [schoolId, 'announcement-drafts'] });
  const removeDraft = useMutation({ mutationFn: (id: string) => api(`${draftsPath}/${id}`, { method: 'DELETE' }), onSuccess: refreshDrafts });
  // Taslaktan açılan pencere: kapatırken sorulur (güncelle / değişiklikleri at / sil), yayına alınınca silinir
  const [draft, setDraft] = useState<{ id: string; step: number; initial: Form } | null>(null);
  const [openRequest, setOpenRequest] = useState<{ values: Form; key: number } | null>(null);
  const draftCount = drafts.data?.length ?? 0;
  const approvalNeeded = Boolean(school.data?.settings.requireApproval) && !approver;
  const openDraft = (d: Draft) => {
    const values = { ...empty(), ...d.data };
    setDraft({ id: d.id, step: d.step, initial: values });
    setOpenRequest({ values, key: Date.now() });
  };

  return (
    <>
    <ReviewDialog row={reviewing} onClose={closeReview} onEdit={(r) => setParams({ duzenle: r.id }, { replace: true })} />
    <CrudPage<Announcement, Form>
      resource="announcements"
      label="Duyuru"
      title="Duyurular"
      description="Panonun orta alanında slayt olarak dönen görselli, videolu, metin ve hazır şablonlu duyurular. Sırayı oklarla değiştirebilir, yayın tarihi vererek önceden planlayabilirsiniz."
      permission="announcements.manage"
      icon={<Megaphone className="size-6" />}
      emptyTitle="Henüz duyuru yok"
      emptyText="İlk duyurunuzu ekleyin; kaydettiğiniz anda tüm ekranlarda görünür."
      addLabel="Yeni duyuru"
      activeToggle
      reorderable
      modalSize="xl"
      schema={announcementSchema}
      select={(rows) =>
        sortByPublish(filter === 'pending' ? rows.filter((r) => r.approvalStatus === 'pending') : rows, (r) => r.approvalStatus !== 'approved')
      }
      tabs={
        <div className="space-y-3">
          {pendingCount > 0 && (
            <Alert tone="amber">
              {approver
                ? `${pendingCount} duyuru onayınızı bekliyor. Onaylanınca panolarda yayına çıkar.`
                : `${pendingCount} duyuru onay bekliyor; yetkili kişi onaylayınca panolarda yayına çıkar.`}
            </Alert>
          )}
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Tümü' },
              ...(pendingCount > 0 || school.data?.settings.requireApproval
                ? [{ value: 'pending' as const, label: `Onay Bekleyenler${pendingCount ? ` (${pendingCount})` : ''}` }]
                : []),
              {
                value: 'drafts' as const,
                label: (
                  <span className="flex items-center gap-1.5">
                    Taslaklar
                    {draftCount > 0 && (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] leading-5 font-extrabold text-white" aria-label={`${draftCount} taslak`}>
                        {draftCount}
                      </span>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </div>
      }
      replaceContent={
        filter === 'drafts' ? <DraftList drafts={drafts.data ?? []} loading={drafts.isLoading} onOpen={openDraft} onDelete={(id) => removeDraft.mutate(id)} /> : undefined
      }
      openRequest={openRequest}
      // Başkasının duyurusunu yalnızca onay yetkisi olan değiştirir (sunucuda da aynı kural)
      rowEditable={(r) => approver || r.createdBy === me?.user.id}
      lockedReason="Başkasının duyurusunu yalnızca duyuru onaylama yetkisi olan değiştirebilir."
      renderModal={(m) => (
        <AnnouncementWizard
          api={m}
          startStep={draft?.step ?? 0}
          defaultDuration={defaultDuration}
          maxDuration={school.data?.settings.slideMaxDurationSec ?? 60}
          isApprover={approver}
          approvalNeeded={approvalNeeded}
          isDirty={(values) =>
            m.editing ? JSON.stringify(values) !== JSON.stringify(toForm(m.editing)) : draft ? JSON.stringify(values) !== JSON.stringify(draft.initial) : hasContent(values)
          }
          onDismiss={(values, step) => {
            void (async () => {
              const close = () => {
                setDraft(null);
                m.close();
              };
              const saveDraft = async () => {
                try {
                  if (draft) await api(`${draftsPath}/${draft.id}`, { method: 'PUT', body: { step, data: values } });
                  else await api(draftsPath, { method: 'POST', body: { step, data: values } });
                  await refreshDrafts();
                  toast.success(draft ? 'Taslak güncellendi' : 'Duyuru taslaklara kaydedildi');
                  close();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Taslak kaydedilemedi');
                }
              };
              if (m.editing) {
                // Yayındaki duyurunun düzenlemesi taslak olmaz: değişiklik varsa atılıp atılmayacağı sorulur
                const changed = JSON.stringify(values) !== JSON.stringify(toForm(m.editing));
                if (!changed) return close();
                const c = await choose({
                  title: 'Değişiklikler kaydedilmedi',
                  message: 'Çıkarsanız duyuruda yaptığınız değişiklikler kaybolur.',
                  tone: 'warning',
                  cancelLabel: 'Düzenlemeye devam et',
                  choices: [{ value: 'discard', label: 'Değişiklikleri at', kind: 'delete' }],
                });
                if (c === 'discard') close();
                return;
              }
              if (draft) {
                // Taslaktan devam: değişiklik yoksa sormadan kapanır
                if (JSON.stringify(values) === JSON.stringify(draft.initial)) return close();
                const c = await choose({
                  title: 'Taslakta değişiklik var',
                  message: '"Değişiklikleri at" taslağı açtığınız hâline bırakır; "Taslağı sil" taslağı tamamen kaldırır.',
                  tone: 'neutral',
                  cancelLabel: 'Yazmaya devam et',
                  choices: [
                    { value: 'remove', label: 'Taslağı sil', kind: 'delete' },
                    { value: 'discard', label: 'Değişiklikleri at', kind: 'secondary' },
                    { value: 'save', label: 'Taslağı güncelle', kind: 'primary' },
                  ],
                });
                if (c === 'save') await saveDraft();
                else if (c === 'discard') close();
                else if (c === 'remove') {
                  await api(`${draftsPath}/${draft.id}`, { method: 'DELETE' }).catch(() => undefined);
                  await refreshDrafts();
                  close();
                }
                return;
              }
              // Yeni duyuru: hiçbir şey yazılmadıysa sormadan kapanır
              if (!hasContent(values)) return close();
              const c = await choose({
                title: 'Duyuruyu taslak olarak saklayalım mı?',
                message: 'Taslaklar, Duyurular sayfasındaki "Taslaklar" sekmesinde durur; kaldığınız yerden devam edebilirsiniz.',
                tone: 'neutral',
                cancelLabel: 'Yazmaya devam et',
                choices: [
                  { value: 'delete', label: 'Sil ve çık', kind: 'delete' },
                  { value: 'save', label: 'Taslak olarak kaydet', kind: 'primary' },
                ],
              });
              if (c === 'save') await saveDraft();
              else if (c === 'delete') close();
            })();
          }}
          onSaved={() => {
            if (draft) void api(`${draftsPath}/${draft.id}`, { method: 'DELETE' }).then(refreshDrafts, refreshDrafts);
            setDraft(null);
          }}
        />
      )}
      rowActions={(r) =>
        approver && r.approvalStatus === 'pending' ? (
          <Button size="sm" variant="success" icon={<ScanEye className="size-3.5" />} onClick={() => openReview(r.id)}>
            İncele
          </Button>
        ) : null
      }
      // Onay bekleyen / düzeltme istenen en üstte; sonra yayında, pasif, planlanan; en altta süresi dolan
      savedMessage={(r, isNew) =>
        r.approvalStatus === 'pending' ? 'Duyuru onaya gönderildi; onaylanınca panolarda yayına çıkar' : isNew ? 'Duyuru eklendi' : 'Duyuru güncellendi'
      }
      rowState={(r) =>
        r.approvalStatus === 'pending'
          ? { toggle: { checked: false, disabled: 'Onaylanınca yayına çıkar' } }
          : r.approvalStatus === 'rejected'
            ? { toggle: { checked: false, disabled: 'Düzeltme istendi: düzenleyip kaydedince yeniden onaya gider' } }
            : expiredRowState(r)
      }
      columns={[
        {
          header: 'Duyuru',
          cell: (r) => (
            <div className="flex items-center gap-3">
              <Thumb row={r} />
              <div className="min-w-0">
                <div className="max-w-[20rem] truncate font-semibold text-ink">{r.title}</div>
                {r.body && <div className="max-w-[20rem] truncate text-slate-500">{r.body}</div>}
                {scheduleSummary(r.screenIds, r.schedule, screens.data) && (
                  <div className="mt-1 inline-flex max-w-[20rem] truncate rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
                    {scheduleSummary(r.screenIds, r.schedule, screens.data)}
                  </div>
                )}
              </div>
            </div>
          ),
        },
        {
          header: 'Tür',
          cell: (r) => (
            <span className="text-slate-600">
              {KIND_LABEL[r.kind]}
              {r.kind === 'design' && r.design && <span className="block text-xs text-slate-400">{designTemplate(r.design.template).name}</span>}
            </span>
          ),
        },
        {
          header: 'Durum',
          cell: (r) => (
            <div className="space-y-1">
              <ApprovalBadge row={r} />
              {r.approvalStatus === 'approved' && <PublishCell row={r} />}
            </div>
          ),
        },
      ]}
      emptyForm={empty}
      toForm={toForm}
      toPayload={toAnnouncementPayload}
      // Pencere adım adım sihirbazdır (renderModal); bu ortak form kullanılmaz
      renderForm={() => null}
    />
    </>
  );
}

/** Taslaklar: yarım kalan duyurular (yalnızca giren kişi görür); "Devam et" kaldığı adımdan açar */
function DraftList({ drafts, loading, onOpen, onDelete }: { drafts: Draft[]; loading: boolean; onOpen: (d: Draft) => void; onDelete: (id: string) => void }) {
  if (!loading && !drafts.length)
    return (
      <Card>
        <EmptyState icon={<FileText className="size-6" />} title="Taslak yok" description="Yeni duyuruyu yarıda bırakırsanız burada saklanır; kaldığınız adımdan devam edebilirsiniz." />
      </Card>
    );
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {drafts.map((d) => {
          const f = { ...emptyAnnouncementForm(), ...d.data };
          const title = (f.kind === 'design' ? designTitle(f.design).trim() : f.title.trim()) || 'Başlıksız taslak';
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <FileText className="size-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink">{title}</div>
                <div className="text-xs text-slate-500">
                  {FORM_KIND_LABEL[f.kind]} · "{STEPS[Math.min(3, d.step)]}" adımında kaldı · {formatDateTime(d.updatedAt)}
                </div>
              </div>
              <Button size="sm" onClick={() => onOpen(d)}>
                Devam et
              </Button>
              <DeleteButton label="Taslağı sil" what="Bu taslak" onConfirm={() => onDelete(d.id)} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
