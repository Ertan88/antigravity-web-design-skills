import { errorText } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useSchoolPath, type Announcement, type Leave, type Teacher } from '../lib/data.ts';
import { formatDate, timeAgo } from '../lib/format.ts';
import { useToast } from './Toast.tsx';
import { Button, Field, Modal, Textarea } from './ui.tsx';

/** Kart en çok bu kadar satır gösterir; fazlası için ilgili sayfaya bağlantı */
const MAX_ROWS = 5;

type Row = { kind: 'announcement'; a: Announcement } | { kind: 'leave'; l: Leave & { requestedBy?: string | null } };

/**
 * Genel Bakış › Onay bekleyenler (3A): kişinin onaylayabileceği duyurular ve izin bildirimleri tek kartta, onay
 * sayfa değiştirmeden verilir. Reddederken gerekçe sorulur (kişiye bildirimde gider). Bekleyen yoksa kart görünmez.
 */
export function ApprovalsCard() {
  const { can, schoolId, me } = useAuth();
  const canAnn = can('announcements.approve');
  const canLeave = can('leaves.manage');
  const ann = useList<Announcement>('announcements');
  const leaves = useList<Leave & { requestedBy?: string | null }>('leaves');
  const teachers = useList<Teacher>('teachers');
  const annPath = useSchoolPath('announcements');
  const leavePath = useSchoolPath('leaves');
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [note, setNote] = useState('');

  const names = new Map((teachers.data ?? []).map((t) => [t.id, t.fullName]));
  const rows: Row[] = [
    ...(canAnn ? (ann.data ?? []).filter((a) => a.approvalStatus === 'pending').map((a): Row => ({ kind: 'announcement', a })) : []),
    // Kişi kendi izin bildirimini onaylayamaz (sunucu da reddeder)
    ...(canLeave ? (leaves.data ?? []).filter((l) => l.approvalStatus === 'pending' && l.requestedBy !== me?.user.id).map((l): Row => ({ kind: 'leave', l })) : []),
  ];
  if (!rows.length) return null;

  const idOf = (r: Row) => (r.kind === 'announcement' ? r.a.id : r.l.id);
  const review = async (r: Row, action: 'approve' | 'reject', reason?: string) => {
    setBusy(`${idOf(r)}:${action}`);
    try {
      const base = r.kind === 'announcement' ? annPath : leavePath;
      await api(`${base}/${idOf(r)}/${action}`, { method: 'POST', body: reason ? { note: reason } : {} });
      await qc.invalidateQueries({ queryKey: [schoolId, r.kind === 'announcement' ? 'announcements' : 'leaves'] });
      toast.success(action === 'approve' ? 'Onaylandı' : r.kind === 'announcement' ? 'Düzeltmeye gönderildi' : 'İzin talebi onaylanmadı');
      setRejecting(null);
      setNote('');
    } catch (err) {
      toast.error(errorText(err, 'İşlem yapılamadı'));
    } finally {
      setBusy(null);
    }
  };

  const shown = rows.slice(0, MAX_ROWS);
  const annReject = rejecting?.kind === 'announcement';

  return (
    <section aria-labelledby="onay-bekleyenler" className="rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-300 dark:bg-amber-500/10 dark:ring-amber-400/30">
      <div className="flex items-center gap-2">
        <h2 id="onay-bekleyenler" className="text-lg font-extrabold text-ink">
          Onay bekleyenler
        </h2>
        <span className="rounded-full bg-tile-sun px-2 py-0.5 text-xs font-extrabold text-tile-sun-ink">{rows.length}</span>
      </div>
      <ul className="mt-3 divide-y divide-amber-200/70 dark:divide-white/10">
        {shown.map((r) => {
          const id = idOf(r);
          return (
            <li key={id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <span
                className={
                  r.kind === 'announcement'
                    ? 'w-fit rounded-full bg-tile-sky px-2 py-0.5 text-xs font-bold text-tile-sky-ink'
                    : 'w-fit rounded-full bg-tile-rose px-2 py-0.5 text-xs font-bold text-tile-rose-ink'
                }
              >
                {r.kind === 'announcement' ? 'Duyuru' : 'İzin'}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                {r.kind === 'announcement' ? (
                  <>
                    <span className="font-bold text-ink">{r.a.title}</span>
                    <span className="text-slate-500">
                      {' '}
                      · {r.a.createdByName ?? 'Bir kullanıcı'}, {timeAgo(r.a.createdAt)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-ink">{names.get(r.l.teacherId) ?? 'Öğretmen'}</span>
                    <span className="text-slate-500">
                      {' '}
                      · {r.l.startDate === r.l.endDate ? formatDate(r.l.startDate) : `${formatDate(r.l.startDate)} – ${formatDate(r.l.endDate)}`}
                      {r.l.note ? ` · ${r.l.note}` : ''}
                    </span>
                  </>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {r.kind === 'announcement' ? (
                  <Link to={`/duyurular?incele=${id}`} className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-white dark:text-slate-200 dark:ring-white/20 dark:hover:bg-white/5">
                    Aç
                  </Link>
                ) : (
                  <Button size="sm" variant="delete" disabled={Boolean(busy)} onClick={() => setRejecting(r)}>
                    Reddet
                  </Button>
                )}
                <Button size="sm" loading={busy === `${id}:approve`} disabled={Boolean(busy)} onClick={() => void review(r, 'approve')}>
                  Onayla
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > MAX_ROWS && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {rows.length - MAX_ROWS} kayıt daha var:{' '}
          {canAnn && (
            <Link to="/duyurular" className="font-bold text-brand-600">
              Duyurular
            </Link>
          )}
          {canAnn && canLeave && ' · '}
          {canLeave && (
            <Link to="/izinler" className="font-bold text-brand-600">
              İzinli Öğretmenler
            </Link>
          )}
        </p>
      )}

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={annReject ? 'Düzeltmeye gönder' : 'İzin talebi onaylanmasın mı?'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Vazgeç
            </Button>
            <Button
              variant="danger"
              loading={Boolean(rejecting && busy === `${idOf(rejecting)}:reject`)}
              disabled={annReject && note.trim().length < 3}
              onClick={() => rejecting && void review(rejecting, 'reject', note.trim() || undefined)}
            >
              {annReject ? 'Düzeltmeye gönder' : 'Onaylama'}
            </Button>
          </>
        }
      >
        <Field label={annReject ? 'Düzeltme nedeni' : 'Gerekçe (isteğe bağlı)'} help="Kişiye bildirimde gider.">
          {(fid) => <Textarea id={fid} value={note} maxLength={200} rows={3} onChange={(e) => setNote(e.target.value)} placeholder={annReject ? 'ör. Tarih yanlış yazılmış' : 'ör. O gün okulda sınav var'} />}
        </Field>
      </Modal>
    </section>
  );
}
