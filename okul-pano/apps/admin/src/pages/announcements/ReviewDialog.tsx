import { parseYouTubeUrl, youTubeThumbnail } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Megaphone, Pencil, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Button, Field, Modal, Textarea } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useList, useSchoolPath, type Announcement, type Screen } from '../../lib/data.ts';
import { formatDateTime, timeAgo } from '../../lib/format.ts';
import { DesignThumb } from './DesignEditor.tsx';
import { scheduleSummary } from './ScheduleFields.tsx';

/** Duyurunun panoda nasıl görüneceğine yakın önizleme */
export function AnnouncementPreview({ row }: { row: Announcement }) {
  if (row.kind === 'design' && row.design) return <DesignThumb design={row.design} className="overflow-hidden rounded-xl ring-1 ring-slate-200" />;
  const yt = row.youtubeUrl ? parseYouTubeUrl(row.youtubeUrl) : null;
  const src = row.kind === 'image' ? row.imageUrl : yt ? youTubeThumbnail(yt.id) : null;
  return (
    <div className="overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-200">
      {src ? (
        <img src={src} alt="" className="aspect-video w-full object-contain" />
      ) : (
        <div className="flex aspect-video flex-col justify-center gap-3 bg-tile-dark p-8 text-white">
          <Megaphone className="size-8 opacity-80" />
          <div className="text-2xl font-bold">{row.title}</div>
          {row.body && <div className="text-base opacity-90">{row.body}</div>}
        </div>
      )}
      {src && (
        <div className="bg-stone-800 px-4 py-3 text-white">
          <div className="font-semibold">{row.title}</div>
          {row.body && <div className="text-sm opacity-80">{row.body}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Onay penceresi: içerik panodaki gibi önizlenir; onay yetkilisi onaylar, kendisi düzenler
 * ya da nedenini yazarak duyuruyu girene düzeltmeye geri gönderir.
 */
export function ReviewDialog({ row, onClose, onEdit }: { row: Announcement | null; onClose: () => void; onEdit: (row: Announcement) => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('announcements');
  const qc = useQueryClient();
  const toast = useToast();
  const screens = useList<Screen>('screens');
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');
  const review = useMutation({
    mutationFn: (v: { action: 'approve' | 'reject'; note?: string }) => api(`${path}/${row!.id}/${v.action}`, { method: 'POST', body: { note: v.note ?? null } }),
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: [schoolId, 'announcements'] });
      void qc.invalidateQueries({ queryKey: [schoolId, 'notifications'] });
      toast.success(v.action === 'approve' ? 'Duyuru onaylandı, panolarda yayında' : 'Duyuru düzeltme için geri gönderildi');
      close();
    },
    onError: (e) => toast.error(e.message),
  });
  const close = () => {
    setReturning(false);
    setNote('');
    onClose();
  };
  if (!row) return null;
  const plan = scheduleSummary(row.screenIds, row.schedule, screens.data);
  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title="Duyuruyu incele"
      description={`${row.createdByName ?? 'Bir kullanıcı'} · ${timeAgo(row.updatedAt)} gönderdi`}
      footer={
        returning ? (
          <>
            <Button variant="secondary" onClick={() => setReturning(false)}>
              Vazgeç
            </Button>
            <Button variant="danger" icon={<Undo2 className="size-4" />} disabled={!note.trim()} loading={review.isPending} onClick={() => review.mutate({ action: 'reject', note })}>
              Düzeltmeye gönder
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" icon={<Undo2 className="size-4" />} onClick={() => setReturning(true)}>
              Düzeltmeye gönder
            </Button>
            <Button
              variant="secondary"
              icon={<Pencil className="size-4" />}
              // Üst bileşen inceleme penceresini kapatıp düzenleme formunu açar
              onClick={() => {
                setReturning(false);
                setNote('');
                onEdit(row);
              }}
            >
              Kendim düzenleyeyim
            </Button>
            <Button variant="success" icon={<Check className="size-4" />} loading={review.isPending} onClick={() => review.mutate({ action: 'approve' })}>
              Onayla ve yayınla
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <AnnouncementPreview row={row} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-slate-500">Yayın</dt>
          <dd className="text-ink">
            {row.startsAt ? formatDateTime(row.startsAt) : 'Hemen'} → {row.endsAt ? formatDateTime(row.endsAt) : 'süresiz'}
          </dd>
          <dt className="text-slate-500">Akış</dt>
          <dd className="text-ink">{plan ?? 'Bütün panolarda, sürekli'}</dd>
        </dl>
        {returning && (
          <Field label="Düzeltme nedeni" help="Duyuruyu giren kişiye bildirim olarak gider; düzeltip kaydedince yeniden onayınıza gelir.">
            {(id) => <Textarea id={id} rows={3} maxLength={200} value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder="ör. Tarih yanlış, 14 Kasım olmalı." />}
          </Field>
        )}
        {!returning && <p className="text-xs text-slate-500">“Kendim düzenleyeyim” ile yaptığınız değişiklikler kaydedilince duyuru onaylanmış olarak yayına çıkar.</p>}
      </div>
    </Modal>
  );
}
