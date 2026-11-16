import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Check, Inbox, Mail, Undo2 } from '../../components/icons.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Badge, Button, Card, DeleteButton, EmptyState, PageHeader, Segmented, Spinner } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { formatDateTime } from '../../lib/format.ts';

interface ContactRequest {
  id: string;
  topic: 'demo' | 'quote' | 'question';
  name: string;
  role: string;
  school: string;
  city: string;
  email: string;
  phone: string | null;
  preferredTime: string | null;
  message: string;
  status: 'new' | 'done';
  handledAt: string | null;
  createdAt: string;
}

const TOPIC: Record<ContactRequest['topic'], { label: string; tone: 'blue' | 'amber' | 'slate' }> = {
  demo: { label: 'Tanıtım isteği', tone: 'blue' },
  quote: { label: 'Fiyat teklifi', tone: 'amber' },
  question: { label: 'Soru', tone: 'slate' },
};

/**
 * Platform yöneticisi: tanıtım sitesinin iletişim formundan gelen talepler. Yanıtlananlar 1 yıl, yanıtlanmayanlar
 * 2 yıl sonra kendiliğinden silinir (KVKK).
 */
export function ContactRequestsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<'new' | 'done' | 'all'>('new');
  const list = useQuery({ queryKey: ['platform', 'contact'], queryFn: () => api<ContactRequest[]>('/api/platform/contact'), refetchInterval: 60_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['platform', 'contact'] });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: ContactRequest['status'] }) => api(`/api/platform/contact/${v.id}`, { method: 'PATCH', body: { status: v.status } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/platform/contact/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Talep silindi.');
      void refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = list.data ?? [];
  const fresh = all.filter((r) => r.status === 'new').length;
  const rows = all.filter((r) => filter === 'all' || r.status === filter);

  return (
    <div>
      <PageHeader
        title="İletişim talepleri"
        description="Tanıtım sitesindeki iletişim formundan gelen tanıtım, teklif ve soru talepleri. Yanıtlananlar 1 yıl, yanıtlanmayanlar 2 yıl sonra kendiliğinden silinir."
      />
      <div className="mb-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'new', label: `Yeni (${fresh})` },
            { value: 'done', label: 'Yanıtlandı' },
            { value: 'all', label: 'Tümü' },
          ]}
        />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : !rows.length ? (
        <EmptyState icon={<Inbox className="size-6" />} title={filter === 'new' ? 'Yeni talep yok' : 'Talep yok'} />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TOPIC[r.topic].tone}>{TOPIC[r.topic].label}</Badge>
                    {r.status === 'done' && <Badge tone="green">Yanıtlandı</Badge>}
                    <span className="text-xs font-semibold text-slate-500">{formatDateTime(r.createdAt)}</span>
                  </div>
                  <h3 className="mt-2 text-base font-extrabold text-ink">{r.school}</h3>
                  <p className="text-sm font-semibold text-slate-600">
                    {r.name} · {r.role} · {r.city}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.status === 'new' ? (
                    <Button size="sm" variant="secondary" icon={<Check className="size-4" />} loading={setStatus.isPending && setStatus.variables?.id === r.id} onClick={() => setStatus.mutate({ id: r.id, status: 'done' })}>
                      Yanıtlandı
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => setStatus.mutate({ id: r.id, status: 'new' })}>
                      Yeniye al
                    </Button>
                  )}
                  <DeleteButton what="Bu talep" onConfirm={() => remove.mutate(r.id)} />
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line rounded-2xl bg-slate-50 p-3.5 text-sm text-slate-700 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">{r.message}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm font-semibold text-slate-600">
                <a className="inline-flex items-center gap-1.5 text-brand-700 hover:underline dark:text-slate-100" href={`mailto:${r.email}?subject=${encodeURIComponent('Okul Yayın')}`}>
                  <Mail className="size-4" /> {r.email}
                </a>
                {r.phone && <a className="hover:underline" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a>}
                {r.preferredTime && <span>Uygun zaman: {r.preferredTime}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
