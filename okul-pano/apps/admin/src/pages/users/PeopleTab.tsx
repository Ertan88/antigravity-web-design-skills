import { DUTY_PACKAGES, normalizeName } from '@okulpano/shared';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Check, Pencil, Search, Users as UsersIcon } from '../../components/icons.tsx';
import { ACTION_SHAPE, Badge, Button, Card, EDIT_TONE, EmptyState, Input, Modal } from '../../components/ui.tsx';
import { Avatar, PersonCard, RolePill, type CardContext } from './PersonCard.tsx';
import { STATUS, type Person } from './people.ts';

type Filter = 'all' | 'none' | 'invited' | 'pending' | 'management';

const dutyLabel = Object.fromEntries(DUTY_PACKAGES.map((d) => [d.key, d.label]));

/** Geniş ekranda kart yanda, dar ekranda pencerede */
function useWide() {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/** Kişiler: kadro ve kadro dışı hesaplar tek listede; satır bir şey açmaz, kişinin kartı yalnızca kalemle (Düzenle) açılır */
export function PeopleTab({
  people,
  ctx,
  initialQuery,
  onApproveAll,
  approving,
}: {
  people: Person[];
  ctx: CardContext;
  initialQuery?: string;
  onApproveAll: (list: Person[]) => void;
  approving: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState(initialQuery ?? '');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const wide = useWide();

  const counts: Record<Filter, number> = {
    all: people.length,
    none: people.filter((p) => p.status === 'none' || p.status === 'code').length,
    invited: people.filter((p) => p.status === 'invited').length,
    pending: people.filter((p) => p.status === 'pending').length,
    management: people.filter((p) => p.role === 'owner' || p.role === 'admin').length,
  };
  const needle = normalizeName(q);
  const visible = people.filter((p) => {
    if (filter === 'none' && !(p.status === 'none' || p.status === 'code')) return false;
    if (filter === 'invited' && p.status !== 'invited') return false;
    if (filter === 'pending' && p.status !== 'pending') return false;
    if (filter === 'management' && !(p.role === 'owner' || p.role === 'admin')) return false;
    return !needle || normalizeName(`${p.fullName} ${p.sub} ${p.email ?? ''} ${p.duties.map((d) => dutyLabel[d]).join(' ')}`).includes(needle);
  });
  // Kişinin kartı (iletişim bilgileri dahil) yalnızca kalemle açılır; kendiliğinden seçim yapılmaz
  const selected = people.find((p) => p.key === selectedKey);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Tümü' },
    { key: 'none', label: 'Hesabı yok' },
    { key: 'invited', label: 'Davet bekliyor' },
    { key: 'pending', label: 'Onay bekliyor' },
    { key: 'management', label: 'Yönetim' },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={clsx(
              'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
              filter === f.key ? 'bg-ink text-surface' : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
              f.key === 'pending' && counts.pending > 0 && filter !== f.key && 'text-amber-800 ring-amber-300',
            )}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, branş ya da görev ara" className="pl-9" aria-label="Kişi ara" />
        </div>
      </div>
      {filter === 'pending' && counts.pending > 1 && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" icon={<Check className="size-4" />} loading={approving} onClick={() => onApproveAll(visible)}>
            Hepsini onayla ({counts.pending})
          </Button>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          {!visible.length ? (
            <EmptyState icon={<UsersIcon className="size-6" />} title={people.length ? 'Bu süzgeçte kimse yok' : 'Kadroda öğretmen yok'} description={people.length ? undefined : 'Önce Öğretmen Kadrosu sayfasından öğretmenleri ekleyin ya da Excel’den yükleyin.'} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((p) => {
                const on = selected?.key === p.key;
                return (
                  <li key={p.key}>
                    <div className={clsx('flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5', on && 'bg-slate-50 shadow-[inset_3px_0_0_var(--color-ink)]')}>
                      <Avatar name={p.fullName} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-ink">{p.fullName}</div>
                        <div className="truncate text-xs text-slate-500">{p.sub}</div>
                      </div>
                      <div className="hidden w-36 shrink-0 sm:block">
                        <RolePill role={p.role} />
                      </div>
                      <div className="hidden w-40 shrink-0 flex-wrap gap-1 xl:flex">
                        {p.role === 'owner' || p.role === 'admin' ? (
                          <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700">Tüm bölümler</span>
                        ) : p.duties.length ? (
                          p.duties.map((d) => (
                            <span key={d} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                              {dutyLabel[d]}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                      <div className="w-28 shrink-0 text-right">
                        <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                        {p.member?.promotionRequest && <div className="mt-1 text-[11px] font-semibold text-amber-700">Öneri bekliyor</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(p.key)}
                        aria-label={`${p.fullName} düzenle`}
                        title="Düzenle"
                        className={clsx(
                          ACTION_SHAPE,
                          on ? 'bg-ink text-surface ring-1 ring-ink' : EDIT_TONE,
                        )}
                      >
                        <Pencil className="size-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {wide &&
          (selected ? (
            <Card className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto p-6">
              <PersonCard key={selected.key} person={selected} ctx={ctx} />
            </Card>
          ) : (
            <Card className="sticky top-20 flex flex-col items-center gap-2 p-8 text-center">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Pencil className="size-5" />
              </span>
              <div className="font-semibold text-ink">Kişiyi düzenlemek için kaleme basın</div>
              <p className="text-sm text-slate-500">Rol, görevler, hesap ve iletişim bilgileri burada açılır.</p>
            </Card>
          ))}
      </div>

      {!wide && (
        <Modal open={Boolean(selected)} onClose={() => setSelectedKey(null)} title={selected?.fullName ?? ''} footer={<Button variant="secondary" onClick={() => setSelectedKey(null)}>Kapat</Button>}>
          {selected && <PersonCard key={selected.key} person={selected} ctx={ctx} />}
        </Modal>
      )}
    </>
  );
}
