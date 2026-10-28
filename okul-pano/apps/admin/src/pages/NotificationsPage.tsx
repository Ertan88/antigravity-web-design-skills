import clsx from 'clsx';
import { BellOff, CheckCheck, Mail, MailOpen, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Spinner } from '../components/ui.tsx';
import { kindStyle, useInboxActions, useInboxList, useOpenNotification, type InboxFilter, type InboxItem } from '../lib/inbox.tsx';

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

/** "Bugün", "Dün" ya da "26 Ekim 2026 Pazartesi" */
function dayTitle(key: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400_000).toISOString());
  if (key === today) return 'Bugün';
  if (key === yesterday) return 'Dün';
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
}

const timeOf = (iso: string) => new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(iso));

/**
 * Bildirimler: okunanlar dahil geçmiş (son 180 gün). Okunmamış / okunmuş süzgeci, okundu–okunmadı işareti,
 * silme. Durumu ortadan kalkan bildirimler (duyuru onaylandı, nöbet dolduruldu…) "Tamamlandı" olarak görünür.
 */
export function NotificationsPage() {
  const [filter, setFilter] = useState<InboxFilter>('all');
  const list = useInboxList(filter);
  const { read, unread, remove, readAll } = useInboxActions();
  const openItem = useOpenNotification();
  const pages = list.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const first = pages[0];
  const unreadCount = first?.unread ?? 0;

  // Günlere göre grupla
  const groups: { key: string; items: InboxItem[] }[] = [];
  for (const n of items) {
    const key = dayKey(n.at);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(n);
    else groups.push({ key, items: [n] });
  }

  return (
    <>
      <PageHeader
        title="Bildirimler"
        description="Okuduğunuz bildirimler de burada saklanır (son 180 gün). Okundu bilgisi bütün cihazlarınızda aynıdır."
        actions={
          unreadCount > 0 && (
            <Button variant="secondary" icon={<CheckCheck className="size-4" />} onClick={readAll} loading={read.isPending}>
              Tümünü okundu say
            </Button>
          )
        }
      />
      <div className="mb-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: first ? `Tümü · ${first.total}` : 'Tümü' },
            { value: 'unread', label: `Okunmamış · ${unreadCount}` },
            { value: 'read', label: 'Okunmuş' },
          ]}
        />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon={<BellOff className="size-6" />}
            title={filter === 'unread' ? 'Okunmamış bildirim yok' : filter === 'read' ? 'Okunmuş bildirim yok' : 'Henüz bildirim yok'}
            description="Onay bekleyen duyurular, izin bildirimleri, boş nöbetler ve hatırlatmalar burada birikir."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 text-xs font-bold tracking-wide text-slate-500 uppercase">{dayTitle(g.key)}</h2>
              <Card>
                <ul className="divide-y divide-slate-100">
                  {g.items.map((n) => {
                    const { icon: Icon, tone } = kindStyle(n.kind);
                    const isNew = !n.readAt;
                    return (
                      <li key={n.id} className={clsx('group flex items-start gap-3 px-4 py-3.5', isNew && 'bg-brand-50/40')}>
                        <span className={clsx('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl', tone, !isNew && 'opacity-70')}>
                          <Icon className="size-4" />
                        </span>
                        <button type="button" onClick={() => openItem(n)} className="min-w-0 flex-1 text-left">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className={clsx('text-sm text-ink', isNew ? 'font-bold' : 'font-semibold')}>{n.title}</span>
                            {isNew && <span className="size-2 rounded-full bg-red-500" aria-label="okunmamış" />}
                            {n.resolvedAt && <Badge tone="green">Tamamlandı</Badge>}
                          </span>
                          <span className={clsx('mt-0.5 block text-sm', isNew ? 'text-slate-700' : 'text-slate-500')}>{n.body}</span>
                          <span className="mt-1 block text-xs text-slate-400">
                            {timeOf(n.at)}
                            {n.readAt && ` · okundu ${dayKey(n.readAt) === g.key ? timeOf(n.readAt) : dayTitle(dayKey(n.readAt)).toLocaleLowerCase('tr-TR')}`}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            title={isNew ? 'Okundu say' : 'Okunmadı yap'}
                            aria-label={isNew ? `${n.title}: okundu say` : `${n.title}: okunmadı yap`}
                            onClick={() => (isNew ? read.mutate({ ids: [n.id] }) : unread.mutate(n.id))}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-ink"
                          >
                            {isNew ? <MailOpen className="size-4" /> : <Mail className="size-4" />}
                          </button>
                          <button
                            type="button"
                            title="Sil"
                            aria-label={`${n.title}: sil`}
                            onClick={() => remove.mutate(n.id)}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
          {list.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                Daha eski bildirimler
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
