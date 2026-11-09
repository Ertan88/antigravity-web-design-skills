import { SUPPORT_AREAS, SUPPORT_KINDS, SUPPORT_STATUSES, type SupportArea, type SupportKind, type SupportStatus, type SupportTicket, errorText } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bug, Bulb, HelpCircle, Lifebuoy2, Lock, Paperclip, Send, X } from '../components/icons.tsx';
import { shrinkImage } from '../components/ImageUpload.tsx';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Spinner, Textarea } from '../components/ui.tsx';
import { api, uploadImage } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useSchoolPath } from '../lib/data.ts';
import { Thread } from './Issues.tsx';

/*
 * Destek talepleri. Okul tarafı: yalnızca okul müdürü ve yöneticiler platform yöneticisine sorun / öneri / soru
 * yazar ("Platforma Yaz"). Platform tarafı: bütün okulların talepleri ("Destek talepleri").
 */

const KIND_ICON = { problem: Bug, suggestion: Bulb, question: HelpCircle };
const KIND_TONE: Record<SupportKind, 'red' | 'amber' | 'blue'> = { problem: 'red', suggestion: 'amber', question: 'blue' };
const STATUS_TONE: Record<SupportStatus, 'red' | 'amber' | 'green'> = { new: 'red', answered: 'amber', resolved: 'green' };
const when = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function TicketTable({ rows, onOpen, platform }: { rows: SupportTicket[]; onOpen: (id: string) => void; platform?: boolean }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-surface ring-1 ring-slate-200/70">
      <table className="min-w-full text-sm">
        <thead className="text-left text-[11px] font-bold tracking-wide text-slate-400 uppercase">
          <tr>
            <th className="px-4 py-2.5">Tür</th>
            <th className="px-3 py-2.5">Konu</th>
            {platform && <th className="px-3 py-2.5">Okul</th>}
            <th className="px-3 py-2.5">Gönderen</th>
            <th className="px-3 py-2.5">Son hareket</th>
            <th className="px-3 py-2.5">Durum</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => onOpen(r.id)}>
              <td className="px-4 py-2.5">
                <Badge tone={KIND_TONE[r.kind]}>{SUPPORT_KINDS[r.kind]}</Badge>
              </td>
              <td className="px-3 py-2.5">
                <div className="font-bold text-ink">{r.subject}</div>
                {r.lastMessage && <div className="max-w-md truncate text-xs text-slate-500">{r.lastMessage}</div>}
              </td>
              {platform && <td className="px-3 py-2.5 text-slate-600">{r.schoolName}</td>}
              <td className="px-3 py-2.5 text-slate-600">{r.userName}</td>
              <td className="px-3 py-2.5 text-xs whitespace-nowrap text-slate-500">{when(r.updatedAt)}</td>
              <td className="px-3 py-2.5">
                <Badge tone={STATUS_TONE[r.status]}>{SUPPORT_STATUSES[r.status]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TicketDialog({ id, base, platform, onClose }: { id: string; base: string; platform?: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['support', base, id];
  const q = useQuery({ queryKey: key, queryFn: () => api<SupportTicket>(`${base}/${id}`) });
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (method: 'POST' | 'PATCH', url: string, body: unknown) => {
    setBusy(true);
    try {
      qc.setQueryData(key, await api<SupportTicket>(url, { method, body }));
      void qc.invalidateQueries({ queryKey: ['support', base, 'list'] });
      return true;
    } catch (err) {
      toast.error(errorText(err, 'Gönderilemedi'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const t = q.data;
  const messages = (t?.messages ?? []).map((m) => ({ ...m, userName: m.fromPlatform ? 'Okul Yayın Destek' : m.userName }));
  return (
    <Modal open onClose={onClose} size="lg" title={t?.subject ?? 'Talep'} description={t ? `${SUPPORT_KINDS[t.kind]} · ${SUPPORT_AREAS[t.area]}${platform ? ` · ${t.schoolName} · ${t.userName}` : ''}` : undefined}>
      {!t ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[t.status]}>{SUPPORT_STATUSES[t.status]}</Badge>
            {platform && t.status !== 'resolved' && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void send('PATCH', `${base}/${id}`, { status: 'resolved' })}>
                Çözüldü olarak kapat
              </Button>
            )}
          </div>
          <Thread messages={messages} />
          {messages
            .filter((m) => m.attachmentUrl)
            .map((m) => (
              <a key={m.id} href={m.attachmentUrl!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 underline">
                <Paperclip className="size-3.5" /> Ek görüntü
              </a>
            ))}
          <div className="flex gap-2">
            <Input value={reply} maxLength={2000} placeholder="Yanıt yazın…" onChange={(e) => setReply(e.target.value)} />
            <Button icon={<Send className="size-4" />} loading={busy} disabled={!reply.trim()} onClick={() => void send('POST', `${base}/${id}/messages`, { body: reply }).then((ok) => ok && setReply(''))}>
              Gönder
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Okul: Platforma Yaz (yalnızca okul müdürü ve yöneticiler) */
export function SupportPage() {
  const { school } = useAuth();
  const base = useSchoolPath('support');
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const manager = school?.role === 'owner' || school?.role === 'admin';
  const list = useQuery({ queryKey: ['support', base, 'list'], queryFn: () => api<SupportTicket[]>(base), enabled: manager });
  if (!manager) return <Alert tone="amber">Platforma yalnızca okul müdürü ve yöneticiler yazabilir.</Alert>;
  return (
    <div>
      <PageHeader
        title="Platforma Yaz"
        description="Okul Yayın ekibine sorun, öneri ya da soru gönderin. Yanıt geldiğinde telefonunuza ve bildirim kutunuza haber gelir."
        actions={
          <Button icon={<Send className="size-4" />} onClick={() => setCreating(true)}>
            Yeni talep
          </Button>
        }
      />
      {list.isLoading ? <Spinner /> : list.data?.length ? <TicketTable rows={list.data} onOpen={(id) => setParams({ id })} /> : <EmptyState icon={<Lifebuoy2 className="size-6" />} title="Henüz talep yok" description="Bir sorun yaşarsanız ya da öneriniz varsa “Yeni talep” ile yazın." />}
      {creating && <NewTicket base={base} onClose={() => setCreating(false)} onCreated={(id) => setParams({ id })} />}
      {params.get('id') && <TicketDialog id={params.get('id')!} base={base} onClose={() => setParams({})} />}
    </div>
  );
}

function NewTicket({ base, onClose, onCreated }: { base: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({ kind: 'problem' as SupportKind, area: 'other' as SupportArea, subject: '', body: '', attachmentUrl: null as string | null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const attach = async (f: File | undefined) => {
    if (!f) return;
    try {
      setV({ ...v, attachmentUrl: await uploadImage(schoolId, await shrinkImage(f)) });
    } catch (err) {
      setError(errorText(err, 'Yüklenemedi'));
    }
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const t = await api<SupportTicket>(base, { method: 'POST', body: v });
      await qc.invalidateQueries({ queryKey: ['support', base, 'list'] });
      toast.success('Talebiniz gönderildi');
      onClose();
      onCreated(t.id);
    } catch (err) {
      setError(errorText(err, 'Gönderilemedi'));
    } finally {
      setBusy(false);
    }
  };
  const chip = (on: boolean) => clsx('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold ring-1', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50');
  return (
    <Modal
      open
      onClose={onClose}
      title="Platforma yaz"
      description="Okul Yayın ekibine sorun, öneri ya da soru"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon={<Send className="size-4" />} loading={busy} disabled={v.subject.trim().length < 3 || v.body.trim().length < 5} onClick={() => void save()}>
            Gönder
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SUPPORT_KINDS) as SupportKind[]).map((k) => {
            const I = KIND_ICON[k];
            return (
              <button key={k} type="button" className={chip(v.kind === k)} onClick={() => setV({ ...v, kind: k })}>
                <I className="size-4" /> {SUPPORT_KINDS[k]}
              </button>
            );
          })}
        </div>
        <Field label="Konu">{(id) => <Input id={id} value={v.subject} maxLength={120} onChange={(e) => setV({ ...v, subject: e.target.value })} placeholder="ör. Excel'den öğrenci yüklerken hata" />}</Field>
        <Field label="Açıklama">{(id) => <Textarea id={id} rows={5} value={v.body} maxLength={4000} onChange={(e) => setV({ ...v, body: e.target.value })} />}</Field>
        <div>
          <div className="mb-2 text-sm font-semibold text-ink">Hangi bölüm?</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SUPPORT_AREAS) as SupportArea[]).map((a) => (
              <button key={a} type="button" className={chip(v.area === a)} onClick={() => setV({ ...v, area: a })}>
                {SUPPORT_AREAS[a]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<Paperclip className="size-4" />} onClick={() => file.current?.click()}>
            {v.attachmentUrl ? 'Ekran görüntüsü eklendi' : 'Ekran görüntüsü ekle'}
          </Button>
          {v.attachmentUrl && (
            <button type="button" aria-label="Eki kaldır" onClick={() => setV({ ...v, attachmentUrl: null })}>
              <X className="size-4 text-slate-500" />
            </button>
          )}
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void attach(e.target.files?.[0])} />
        </div>
        <p className="flex items-start gap-1.5 text-xs text-slate-500">
          <Lock className="mt-0.5 size-3.5 shrink-0" /> Yalnızca okul müdürü ve yöneticiler yazabilir. Kişisel veri (öğrenci adı, T.C. kimlik no) yazmayın.
        </p>
        {error && <Alert tone="red">{error}</Alert>}
      </div>
    </Modal>
  );
}

/** Platform yöneticisi: bütün okulların destek talepleri */
export function PlatformSupportPage() {
  const base = '/api/platform/support';
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<'open' | 'suggestion' | 'resolved' | 'all'>('open');
  const list = useQuery({ queryKey: ['support', base, 'list'], queryFn: () => api<SupportTicket[]>(base), refetchInterval: 60_000 });
  const rows = (list.data ?? []).filter((r) =>
    filter === 'open' ? r.status !== 'resolved' : filter === 'suggestion' ? r.kind === 'suggestion' : filter === 'resolved' ? r.status === 'resolved' : true,
  );
  const open = (list.data ?? []).filter((r) => r.status !== 'resolved').length;
  return (
    <div>
      <PageHeader title="Destek talepleri" description="Okul müdürleri ve yöneticilerinden gelen sorun, öneri ve sorular. Yanıtınız gönderenin telefonuna ve bildirim kutusuna gider." />
      <div className="mb-4 flex gap-1.5">
        {([
          ['open', `Açık (${open})`],
          ['suggestion', 'Öneriler'],
          ['resolved', 'Çözüldü'],
          ['all', 'Tümü'],
        ] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={clsx('rounded-full px-3.5 py-1.5 text-sm font-bold ring-1', filter === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-surface text-slate-600 ring-slate-200')}>
            {l}
          </button>
        ))}
      </div>
      {list.isLoading ? <Spinner /> : rows.length ? <TicketTable rows={rows} onOpen={(id) => setParams({ id })} platform /> : <EmptyState icon={<Lifebuoy2 className="size-6" />} title="Talep yok" />}
      {params.get('id') && <TicketDialog id={params.get('id')!} base={base} platform onClose={() => setParams({})} />}
    </div>
  );
}
