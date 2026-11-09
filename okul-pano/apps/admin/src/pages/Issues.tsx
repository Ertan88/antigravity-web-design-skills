import { isVocationalBranchName, ISSUE_CATEGORIES, ISSUE_CATEGORY_KEYS, ISSUE_STATUSES, trCompare, type IssueCategory, type IssueMessage, type IssueStatus, type SchoolIssue, errorText } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bolt,
  Camera,
  Desk,
  Dots,
  Droplet,
  Filter,
  Send,
  ShieldCheck,
  Spray,
  Temperature,
  Tool,
  Users,
  Wifi,
  X,
  type AppIcon,
} from '../components/icons.tsx';
import { shrinkImage } from '../components/ImageUpload.tsx';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useSchool, useSchoolPath, type Teacher } from '../lib/data.ts';

/*
 * Okul Sorunları: öğretmenler idareye arıza, temizlik, ısınma… bildirir. İdare (müdür ve yöneticiler) pano
 * görünümünde Yeni / İşlemde / Çözüldü sütunlarında izler; kart sürüklenerek ya da açılıp durumu değiştirilir.
 * Her adımda bildirimi gönderene haber gider. Diğer kullanıcılar yalnızca kendi bildirimlerini görür.
 */

export const CATEGORY_STYLE: Record<IssueCategory, { icon: AppIcon; cls: string }> = {
  repair: { icon: Tool, cls: 'bg-orange-100 text-orange-800 dark:bg-[#3d2412] dark:text-[#fed7aa]' },
  cleaning: { icon: Spray, cls: 'bg-green-100 text-green-800 dark:bg-[#10301e] dark:text-[#bbf7d0]' },
  heating: { icon: Temperature, cls: 'bg-rose-100 text-rose-800 dark:bg-[#3e1422] dark:text-[#fecdd3]' },
  electric: { icon: Bolt, cls: 'bg-amber-100 text-amber-800 dark:bg-[#3a300c] dark:text-[#fde68a]' },
  it: { icon: Wifi, cls: 'bg-sky-100 text-sky-800 dark:bg-[#0d2c3f] dark:text-[#bae6fd]' },
  security: { icon: ShieldCheck, cls: 'bg-violet-100 text-violet-800 dark:bg-[#2b2240] dark:text-[#ddd6fe]' },
  water: { icon: Droplet, cls: 'bg-cyan-100 text-cyan-800 dark:bg-[#0b2f36] dark:text-[#a5f3fc]' },
  furniture: { icon: Desk, cls: 'bg-stone-200 text-stone-700 dark:bg-[#2e2a26] dark:text-[#e7e5e4]' },
  other: { icon: Dots, cls: 'bg-slate-100 text-slate-700' },
};

const STATUS_TONE: Record<IssueStatus, 'red' | 'amber' | 'green'> = { new: 'red', in_progress: 'amber', resolved: 'green' };

export function CategoryPill({ category }: { category: IssueCategory }) {
  const s = CATEGORY_STYLE[category];
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', s.cls)}>{ISSUE_CATEGORIES[category]}</span>;
}

const ago = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  if (days < 1) return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(d);
  if (days < 2) return 'dün';
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(d);
};

export function Thread({ messages }: { messages: IssueMessage[] }) {
  return (
    <div className="space-y-2">
      {messages.map((m) =>
        m.system ? (
          <div key={m.id} className="text-center text-xs text-slate-400">
            {m.body} · {ago(m.at)}
          </div>
        ) : (
          <div key={m.id} className={clsx('max-w-[85%] rounded-2xl px-3 py-2 text-sm', m.mine ? 'ml-auto rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-slate-100 text-ink')}>
            <div className="text-[11px] font-bold opacity-70">
              {m.userName} · {ago(m.at)}
            </div>
            <div className="whitespace-pre-wrap">{m.body}</div>
          </div>
        ),
      )}
    </div>
  );
}

export function Issues() {
  const { school } = useAuth();
  const manager = school?.role === 'owner' || school?.role === 'admin';
  const path = useSchoolPath('issues');
  const [params, setParams] = useSearchParams();
  const [cat, setCat] = useState<IssueCategory | ''>('');
  const [creating, setCreating] = useState(false);
  const [owners, setOwners] = useState(false);
  const openId = params.get('id');
  const qc = useQueryClient();
  const list = useQuery({ queryKey: [school?.id, 'issues', manager], queryFn: () => api<SchoolIssue[]>(`${path}?scope=${manager ? 'all' : 'mine'}`), refetchInterval: 30_000 });
  const toast = useToast();
  const rows = (list.data ?? []).filter((r) => !cat || r.category === cat);
  const weekAgo = Date.now() - 7 * 86400_000;
  const cols: { status: IssueStatus; title: string; items: SchoolIssue[] }[] = [
    { status: 'new', title: 'Yeni', items: rows.filter((r) => r.status === 'new').sort((a, b) => Number(b.urgent) - Number(a.urgent)) },
    { status: 'in_progress', title: 'İşlemde', items: rows.filter((r) => r.status === 'in_progress') },
    { status: 'resolved', title: 'Çözüldü · son 7 gün', items: rows.filter((r) => r.status === 'resolved' && Date.parse(r.resolvedAt ?? r.updatedAt) > weekAgo) },
  ];
  const move = async (id: string, status: IssueStatus) => {
    try {
      await api(`${path}/${id}`, { method: 'PATCH', body: { status } });
      await qc.invalidateQueries({ queryKey: [school?.id, 'issues'] });
    } catch (err) {
      toast.error(errorText(err, 'Değiştirilemedi'));
    }
  };
  const counts = { new: cols[0]!.items.length, in_progress: cols[1]!.items.length };

  return (
    <div>
      <PageHeader
        title="Okul Sorunları"
        description={
          manager
            ? `Öğretmenlerin bildirdiği sorunlar · ${counts.new} yeni, ${counts.in_progress} işlemde. Kartı sürükleyerek ya da açıp durumunu değiştirin; bildirimi gönderen her adımda haberdar olur.`
            : 'Okuldaki bir sorunu (arıza, temizlik, ısınma…) idareye bildirin; durumunu buradan izleyin.'
        }
        actions={
          <div className="flex gap-2">
            {manager && (
              <Button variant="secondary" icon={<Users className="size-4" />} onClick={() => setOwners(true)}>
                Sorumlular
              </Button>
            )}
            <Button icon={<Send className="size-4" />} onClick={() => setCreating(true)}>
              Sorun bildir
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Filter className="size-4 text-slate-400" />
        {(['', ...ISSUE_CATEGORY_KEYS] as const).map((k) => (
          <button
            key={k || 'all'}
            type="button"
            onClick={() => setCat(k)}
            className={clsx('rounded-full px-3 py-1 text-xs font-bold ring-1', cat === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50')}
          >
            {k ? ISSUE_CATEGORIES[k] : 'Tümü'}
          </button>
        ))}
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : manager ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {cols.map((c) => (
            <div
              key={c.status}
              className="min-h-80 rounded-3xl bg-slate-100/80 p-2.5 dark:bg-white/5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('text/plain');
                if (id) void move(id, c.status);
              }}
            >
              <div className="mb-2 flex justify-between px-2 text-xs font-extrabold text-slate-500">
                <span>{c.title}</span>
                <span>{c.items.length}</span>
              </div>
              <div className="space-y-2">
                {c.items.map((r) => (
                  <IssueCard key={r.id} issue={r} onOpen={() => setParams({ id: r.id })} />
                ))}
                {!c.items.length && <div className="px-2 py-6 text-center text-xs text-slate-400">Boş</div>}
              </div>
            </div>
          ))}
        </div>
      ) : rows.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((r) => (
            <IssueCard key={r.id} issue={r} onOpen={() => setParams({ id: r.id })} showStatus />
          ))}
        </div>
      ) : (
        <EmptyState icon={<AlertTriangle className="size-6" />} title="Bildiriminiz yok" description="Okulda bir sorun görürseniz “Sorun bildir” ile idareye iletin." />
      )}
      {creating && <IssueForm onClose={() => setCreating(false)} />}
      {owners && <OwnersDialog onClose={() => setOwners(false)} />}
      {openId && <IssueDetail id={openId} manager={manager} onClose={() => setParams({})} />}
    </div>
  );
}

function IssueCard({ issue: r, onOpen, showStatus }: { issue: SchoolIssue; onOpen: () => void; showStatus?: boolean }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', r.id)}
      onClick={onOpen}
      className={clsx('block w-full rounded-2xl bg-surface p-3 text-left shadow-[0_1px_2px_rgba(28,25,23,0.06)] ring-1 ring-slate-200/70 hover:ring-slate-300', r.urgent && r.status !== 'resolved' && 'shadow-[inset_3px_0_0_#dc2626]')}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {r.urgent && r.status !== 'resolved' && <Badge tone="red">Acil</Badge>}
        <CategoryPill category={r.category} />
        {showStatus && <Badge tone={STATUS_TONE[r.status]}>{ISSUE_STATUSES[r.status]}</Badge>}
      </div>
      <div className="mt-1.5 text-sm font-bold text-ink">
        {r.location} · <span className="font-semibold">{r.description.length > 70 ? `${r.description.slice(0, 69)}…` : r.description}</span>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {r.mine ? 'Siz' : r.reporterName} · {ago(r.createdAt)}
        {r.assigneeName ? ` · ${r.assigneeName} ilgileniyor` : ''}
      </div>
      {r.lastMessage && <div className="mt-1.5 truncate rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-white/5">{r.lastMessage}</div>}
    </button>
  );
}

function IssueDetail({ id, manager, onClose }: { id: string; manager: boolean; onClose: () => void }) {
  const { school } = useAuth();
  const path = useSchoolPath('issues');
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: [school?.id, 'issues', 'detail', id], queryFn: () => api<SchoolIssue>(`${path}/${id}`) });
  const r0 = q.data;
  const mgrs = useQuery({
    queryKey: [school?.id, 'issues', 'managers', r0?.category],
    queryFn: () => api<{ id: string; fullName: string; helper: boolean }[]>(`${path}/managers?category=${r0!.category}`),
    enabled: manager && Boolean(r0),
  });
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = (data: SchoolIssue) => {
    qc.setQueryData([school?.id, 'issues', 'detail', id], data);
    void qc.invalidateQueries({ queryKey: [school?.id, 'issues'] });
  };
  const call = async (body: unknown, url = `${path}/${id}`, method: 'PATCH' | 'POST' = 'PATCH') => {
    setBusy(true);
    try {
      refresh(await api<SchoolIssue>(url, { method, body }));
      return true;
    } catch (err) {
      toast.error(errorText(err, 'İşlem yapılamadı'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const r = q.data;
  return (
    <Modal open onClose={onClose} title={r ? `${ISSUE_CATEGORIES[r.category]} · ${r.location}` : 'Bildirim'} description={r ? `${r.mine ? 'Siz' : r.reporterName} · ${new Date(r.createdAt).toLocaleString('tr-TR')}` : undefined} size="lg">
      {!r ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {r.urgent && <Badge tone="red">Acil</Badge>}
            <CategoryPill category={r.category} />
            <Badge tone={STATUS_TONE[r.status]}>{ISSUE_STATUSES[r.status]}</Badge>
          </div>
          <p className="text-sm whitespace-pre-wrap text-ink">{r.description}</p>
          {r.photoUrl && <img src={r.photoUrl} alt="Sorunun fotoğrafı" className="max-h-72 rounded-2xl object-contain ring-1 ring-slate-200" />}
          {(manager || r.canUpdate) && (
            <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
              <div className="flex gap-1.5">
                {(Object.keys(ISSUE_STATUSES) as IssueStatus[]).map((s) => (
                  <Button key={s} size="sm" variant={r.status === s ? 'primary' : 'secondary'} disabled={busy || r.status === s} onClick={() => void call({ status: s })}>
                    {s === 'in_progress' ? 'İşleme al' : s === 'resolved' ? 'Çözüldü' : 'Yeni'}
                  </Button>
                ))}
              </div>
              {manager ? (
                <div className="min-w-48 flex-1">
                  <Select value={r.assigneeUserId ?? ''} onChange={(e) => void call({ assigneeUserId: e.target.value || null })}>
                    <option value="">Sorumlu seçilmedi</option>
                    {(mgrs.data ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        Sorumlu: {m.fullName}
                        {m.helper ? ' (ek sorumlu)' : ''}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                r.assigneeName && <span className="text-sm text-slate-500">Sorumlu: {r.assigneeName}</span>
              )}
            </div>
          )}
          <Thread messages={r.messages ?? []} />
          <div className="flex gap-2">
            <Input value={reply} maxLength={2000} placeholder="Yanıt yazın…" onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reply.trim() && void call({ body: reply }, `${path}/${id}/messages`, 'POST').then((ok) => ok && setReply(''))} />
            <Button icon={<Send className="size-4" />} loading={busy} disabled={!reply.trim()} onClick={() => void call({ body: reply }, `${path}/${id}/messages`, 'POST').then((ok) => ok && setReply(''))}>
              Gönder
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function IssueForm({ onClose }: { onClose: () => void }) {
  const { school } = useAuth();
  const path = useSchoolPath('issues');
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({ category: '' as IssueCategory | '', location: '', description: '', urgent: false, photoUrl: null as string | null });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', await shrinkImage(f));
      const { url } = await api<{ url: string }>(`${path}/photo`, { method: 'POST', form });
      setV((x) => ({ ...x, photoUrl: url }));
    } catch (err) {
      setError(errorText(err, 'Fotoğraf yüklenemedi'));
    } finally {
      setUploading(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'POST', body: v });
      await qc.invalidateQueries({ queryKey: [school?.id, 'issues'] });
      toast.success('Sorun idareye iletildi');
      onClose();
    } catch (err) {
      setError(errorText(err, 'Gönderilemedi'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Sorun bildir"
      description="Okul idaresine iletilir; durumunu Okul Sorunları sayfasından izlersiniz."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon={<Send className="size-4" />} loading={busy} disabled={!v.category || !v.location.trim() || v.description.trim().length < 3} onClick={() => void save()}>
            İdareye gönder
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="red">Acil durumda (yangın, yaralanma, kavga) telefonla arayın ya da Acil durum düğmesini kullanın; bu form geç görülebilir.</Alert>
        <div>
          <div className="mb-2 text-sm font-semibold text-ink">Ne ile ilgili?</div>
          <div className="grid grid-cols-3 gap-2">
            {ISSUE_CATEGORY_KEYS.map((k) => {
              const S = CATEGORY_STYLE[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setV({ ...v, category: k })}
                  className={clsx('flex flex-col items-center gap-1.5 rounded-2xl bg-surface p-2.5 text-xs font-bold ring-1', v.category === k ? 'ring-2 ring-ink' : 'ring-slate-200 hover:ring-slate-300')}
                >
                  <span className={clsx('grid size-9 place-items-center rounded-xl', S.cls)}>
                    <S.icon className="size-5" />
                  </span>
                  {ISSUE_CATEGORIES[k]}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Nerede?">{(id) => <Input id={id} value={v.location} maxLength={80} placeholder="ör. 2. kat koridor, 10-B sınıfı, bahçe" onChange={(e) => setV({ ...v, location: e.target.value })} />}</Field>
        <Field label="Açıklama">{(id) => <Textarea id={id} rows={3} value={v.description} maxLength={1000} placeholder="Sorunu kısaca anlatın" onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Camera className="size-4" />} loading={uploading} onClick={() => file.current?.click()}>
            {v.photoUrl ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}
          </Button>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
          <button
            type="button"
            onClick={() => setV({ ...v, urgent: !v.urgent })}
            className={clsx('inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold ring-1', v.urgent ? 'bg-rose-600 text-white ring-rose-600' : 'bg-surface text-rose-700 ring-rose-200')}
          >
            <AlertTriangle className="size-4" /> Acil
          </button>
          {v.photoUrl && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              Fotoğraf eklendi
              <button type="button" aria-label="Fotoğrafı kaldır" onClick={() => setV({ ...v, photoUrl: null })}>
                <X className="size-3.5" />
              </button>
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">Fotoğrafta öğrenci yüzü ya da kişisel bilgi olmasın. Fotoğraflar sorun çözüldükten 90 gün sonra silinir.</p>
        {error && <Alert tone="red">{error}</Alert>}
      </div>
    </Modal>
  );
}

/**
 * Kategori sorumluları (okul ayarı): her kategoride bir idareci (issueOwners; seçilmezse bütün idareciler) ve isteğe bağlı
 * ek sorumlular (issueHelpers; ör. meslek ya da bilişim öğretmeni). Bildirim ikisine birden gider; ek sorumlu durumu değiştirebilir.
 */
function OwnersDialog({ onClose }: { onClose: () => void }) {
  const { school: access } = useAuth();
  const school = useSchool();
  const path = useSchoolPath('issues');
  const schoolPath = useSchoolPath();
  const qc = useQueryClient();
  const toast = useToast();
  const mgrs = useQuery({ queryKey: [access?.id, 'issues', 'managers'], queryFn: () => api<{ id: string; fullName: string }[]>(`${path}/managers`) });
  const members = useList<{ userId: string; fullName: string; role: string; teacherId: string | null }>('members');
  const teachers = useList<Teacher>('teachers');
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [helpers, setHelpers] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (school.data) {
      setOwners(school.data.settings.issueOwners ?? {});
      setHelpers(school.data.settings.issueHelpers ?? {});
    }
  }, [school.data]);
  // Ek sorumlu adayları: hesabı olan herkes; meslek alanı öğretmenleri üstte
  const branchOf = new Map((teachers.data ?? []).map((t) => [t.id, t.branch]));
  const candidates = (members.data ?? [])
    .filter((m) => m.role !== 'owner' && m.role !== 'admin')
    .map((m) => {
      const branch = m.teacherId ? (branchOf.get(m.teacherId) ?? null) : null;
      return { id: m.userId, fullName: m.fullName, branch, vocational: Boolean(branch && isVocationalBranchName(branch)) };
    })
    .sort((a, b) => Number(b.vocational) - Number(a.vocational) || trCompare(a.fullName, b.fullName));
  const nameOf = new Map(candidates.map((c) => [c.id, c]));
  const save = async () => {
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(owners).filter(([, v]) => v));
      const cleanHelpers = Object.fromEntries(Object.entries(helpers).filter(([, v]) => v.length));
      const data = await api(schoolPath, { method: 'PATCH', body: { settings: { issueOwners: clean, issueHelpers: cleanHelpers } } });
      qc.setQueryData([access?.id, 'school'], data);
      toast.success('Sorumlular kaydedildi');
      onClose();
    } catch (err) {
      toast.error(errorText(err, 'Kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Kategori sorumluları"
      description="İdareci seçilmeyen kategoride bildirim bütün idarecilere gider. Ek sorumlu (ör. meslek ya da bilişim öğretmeni) bildirimi alır ve durumu “İşlemde” ya da “Çözüldü” yapabilir."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="divide-y divide-slate-100">
        {ISSUE_CATEGORY_KEYS.map((k) => {
          const list = helpers[k] ?? [];
          return (
            <div key={k} className="grid gap-2 py-3 sm:grid-cols-[11rem_1fr]">
              <div className="pt-1.5">
                <CategoryPill category={k} />
              </div>
              <div className="space-y-2">
                <Select value={owners[k] ?? ''} onChange={(e) => setOwners({ ...owners, [k]: e.target.value })} aria-label={`${ISSUE_CATEGORIES[k]} idarecisi`}>
                  <option value="">Bütün idareciler</option>
                  {(mgrs.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName}
                    </option>
                  ))}
                </Select>
                <div className="flex flex-wrap items-center gap-1.5">
                  {list.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-amber-50 py-1 pr-1 pl-3 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                      {nameOf.get(id)?.fullName ?? 'Silinmiş kullanıcı'}
                      {nameOf.get(id)?.branch ? <span className="font-normal text-amber-700/80">· {nameOf.get(id)!.branch}</span> : null}
                      <button type="button" aria-label="Kaldır" onClick={() => setHelpers({ ...helpers, [k]: list.filter((x) => x !== id) })} className="rounded-full p-0.5 hover:bg-amber-100">
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                  {list.length < 10 && (
                    <div className="w-56">
                      <Select value="" onChange={(e) => e.target.value && setHelpers({ ...helpers, [k]: [...list, e.target.value] })} aria-label={`${ISSUE_CATEGORIES[k]} ek sorumlu ekle`}>
                        <option value="">+ Ek sorumlu ekle</option>
                        {candidates
                          .filter((c) => !list.includes(c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.fullName}
                              {c.branch ? ` · ${c.branch}` : ''}
                            </option>
                          ))}
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!candidates.length && <p className="mt-2 text-xs text-slate-500">Ek sorumlu seçebilmek için öğretmenin hesabı olmalı (Kullanıcılar → Kadro).</p>}
    </Modal>
  );
}
