import { applyPersonRole, DUTY_PACKAGES, normalizeName, toggleDuty, type DutyKey } from '@okulpano/shared';
import { useState } from 'react';
import { confirm } from '../../components/confirm.tsx';
import { Plus, Search, X } from '../../components/icons.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Button, Card, Input, Modal } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { Avatar } from './PersonCard.tsx';
import type { Person } from './people.ts';

type Target = { kind: 'management' } | { kind: 'counsel' } | { kind: 'duty'; key: DutyKey; label: string };

/**
 * Görevler: "Bu işi kim yapıyor?" Her görev kartında sorumlular; kartta ＋ ile kişi eklenir, × ile çıkarılır.
 * Yönetim kartına kişiyi yalnızca müdür ekler (yönetici müdüre önerir).
 */
export function DutiesTab({ people, membersPath, refresh }: { people: Person[]; membersPath: string; refresh: () => void }) {
  const { me, school } = useAuth();
  const toast = useToast();
  const iAmOwner = school?.role === 'owner';
  const [picking, setPicking] = useState<Target | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const accounts = people.filter((p) => p.member);
  const management = accounts.filter((p) => p.role === 'owner' || p.role === 'admin');
  const counselors = accounts.filter((p) => p.role === 'counselor');
  // Görev verilebilecekler: editör hesapları (yönetim zaten her şeyi yapar), kendi hesabı hariç
  const editors = accounts.filter((p) => p.member!.role === 'editor' && p.member!.userId !== me?.user.id);
  // Paketin tamamı ya da (eski seçimlerden) bir kısmı verilmiş editörler
  const withDuty = (key: DutyKey) => {
    const pkg = DUTY_PACKAGES.find((d) => d.key === key)!;
    return accounts.filter((p) => p.member!.role === 'editor' && (pkg.permissions as readonly string[]).some((x) => p.member!.permissions.includes(x)));
  };
  const isPartial = (p: Person, key: DutyKey) => !p.duties.includes(key);
  const noAccount = people.filter((p) => !p.member).length;

  const patch = async (p: Person, body: unknown, ok: string) => {
    setBusy(p.key);
    try {
      await api(`${membersPath}/${p.member!.id}`, { method: 'PATCH', body });
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const add = async (t: Target, p: Person) => {
    const m = p.member!;
    setPicking(null);
    if (t.kind === 'management') {
      if (!iAmOwner) {
        setBusy(p.key);
        try {
          await api(`${membersPath}/${m.id}/promotion-request`, { method: 'POST', body: {} });
          toast.success(`${p.fullName} için öneri müdüre gönderildi`);
          refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(null);
        }
        return;
      }
      if (!(await confirm({ title: `${p.fullName} müdür yardımcısı yapılsın mı?`, message: 'Bütün bölümleri düzenler, kullanıcı ekler ve bütün gözlem kayıtlarını görür.', confirmLabel: 'Müdür yardımcısı yap', tone: 'warning' }))) return;
      return patch(p, applyPersonRole('admin', m.permissions), `${p.fullName} artık Müdür yardımcısı`);
    }
    if (t.kind === 'counsel') return patch(p, applyPersonRole('counselor', m.permissions), `${p.fullName} artık Rehber öğretmen`);
    return patch(p, { permissions: toggleDuty(m.permissions, t.key, true) }, `${p.fullName}: ${t.label} görevi verildi`);
  };

  const removeFrom = async (t: Target, p: Person) => {
    const m = p.member!;
    if (t.kind === 'management') {
      if (!(await confirm({ title: `${p.fullName} yönetimden çıkarılsın mı?`, message: 'Öğretmen olur; görevleri ayrıca verilir.', confirmLabel: 'Çıkar', tone: 'danger' }))) return;
      return patch(p, applyPersonRole(p.teacherId ? 'teacher' : 'staff', []), `${p.fullName} yönetimden çıkarıldı`);
    }
    if (t.kind === 'counsel') return patch(p, applyPersonRole(p.teacherId ? 'teacher' : 'staff', m.permissions), `${p.fullName} artık rehber öğretmen değil`);
    return patch(p, { permissions: toggleDuty(m.permissions, t.key, false) }, `${p.fullName}: ${t.label} görevi kaldırıldı`);
  };

  const candidates = (t: Target) => {
    const base = t.kind === 'management' ? editors.filter((p) => !p.member!.promotionRequest) : t.kind === 'counsel' ? editors.filter((p) => p.role !== 'counselor') : editors.filter((p) => !p.duties.includes(t.key));
    const needle = normalizeName(q);
    return base.filter((p) => !needle || normalizeName(`${p.fullName} ${p.sub}`).includes(needle));
  };

  const Person_ = ({ p, t, removable, partial }: { p: Person; t: Target; removable: boolean; partial?: boolean }) => (
    <div className="flex items-center gap-2">
      <Avatar name={p.fullName} className="size-8" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{p.fullName}</div>
        {p.member?.promotionRequest && <div className="text-[11px] text-amber-700">Müdür yardımcısı önerisi bekliyor</div>}
        {partial && <div className="text-[11px] text-amber-700">Kısmen (eski seçim) · kişi kartından tamamlanır</div>}
      </div>
      {removable && (
        <button type="button" aria-label={`${p.fullName} çıkar`} disabled={busy === p.key} onClick={() => void removeFrom(t, p)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-ink">
          <X className="size-4" />
        </button>
      )}
    </div>
  );

  const AddButton = ({ t, label }: { t: Target; label: string }) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        setQ('');
        setPicking(t);
      }}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink ring-1 ring-slate-200 hover:bg-slate-50"
    >
      <Plus className="size-4" />
    </button>
  );

  return (
    <>
      {noAccount > 0 && <p className="mb-3 text-sm text-slate-500">Görev yalnızca hesabı olan kişiye verilir. {noAccount} kişinin hesabı yok; “Hesap aç” ile açın.</p>}
      <Card className="grid gap-3.5 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-200 md:col-span-2 xl:col-span-3">
          <div className="min-w-48 flex-1">
            <div className="font-bold text-violet-800">Yönetim · bütün bölümler</div>
            <div className="text-xs text-violet-700">Okul müdürü ve müdür yardımcıları. {iAmOwner ? 'Müdür yardımcısını siz atarsınız.' : 'Müdür yardımcısını müdür atar; ＋ ile müdüre önerirsiniz.'}</div>
          </div>
          {management.map((p) => (
            <div key={p.key} className="flex items-center gap-2 rounded-full bg-surface/70 py-1 pr-2 pl-1">
              <Avatar name={p.fullName} className="size-8 bg-violet-100 text-violet-800" />
              <span className="text-sm font-semibold">{p.fullName}</span>
              {iAmOwner && p.role === 'admin' && (
                <button type="button" aria-label={`${p.fullName} yönetimden çıkar`} onClick={() => void removeFrom({ kind: 'management' }, p)} className="rounded-full p-0.5 text-violet-400 hover:text-violet-800">
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
          <AddButton t={{ kind: 'management' }} label={iAmOwner ? 'Müdür yardımcısı ekle' : 'Müdür yardımcısı öner'} />
        </div>

        <DutyCard title="Rehberlik" text="Bütün öğrencilerin gözlem kayıtlarını görür" add={<AddButton t={{ kind: 'counsel' }} label="Rehber öğretmen ekle" />}>
          {counselors.map((p) => (
            <Person_ key={p.key} p={p} t={{ kind: 'counsel' }} removable={p.member!.userId !== me?.user.id} />
          ))}
        </DutyCard>
        {DUTY_PACKAGES.map((d) => {
          const t: Target = { kind: 'duty', key: d.key, label: d.label };
          const list = withDuty(d.key);
          return (
            <DutyCard key={d.key} title={d.label} text={d.text} add={<AddButton t={t} label={`${d.label} görevine kişi ekle`} />}>
              {list.map((p) => (
                <Person_ key={p.key} p={p} t={t} removable={p.member!.userId !== me?.user.id} partial={isPartial(p, d.key)} />
              ))}
            </DutyCard>
          );
        })}
      </Card>

      <Modal
        open={picking !== null}
        onClose={() => setPicking(null)}
        title={picking?.kind === 'management' ? (iAmOwner ? 'Müdür yardımcısı ekle' : 'Müdür yardımcısı öner') : picking?.kind === 'counsel' ? 'Rehber öğretmen ekle' : `${picking?.kind === 'duty' ? picking.label : ''} görevi`}
        description={picking?.kind === 'management' && !iAmOwner ? 'Seçtiğiniz kişi müdürün onayına gönderilir.' : 'Hesabı olan kişilerden seçin.'}
        footer={
          <Button variant="secondary" onClick={() => setPicking(null)}>
            Kapat
          </Button>
        }
      >
        {picking && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad ya da branş ara" className="pl-9" aria-label="Kişi ara" autoFocus />
            </div>
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-2xl ring-1 ring-slate-200">
              {candidates(picking).map((p) => (
                <li key={p.key}>
                  <button type="button" onClick={() => void add(picking, p)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                    <Avatar name={p.fullName} className="size-8" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{p.fullName}</div>
                      <div className="truncate text-xs text-slate-500">{p.sub}</div>
                    </div>
                  </button>
                </li>
              ))}
              {!candidates(picking).length && <li className="px-3 py-4 text-center text-sm text-slate-500">Eklenebilecek kişi yok.</li>}
            </ul>
          </div>
        )}
      </Modal>
    </>
  );
}

function DutyCard({ title, text, add, children }: { title: string; text: string; add: React.ReactNode; children: React.ReactNode[] }) {
  return (
    <div className="rounded-2xl p-4 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-ink">{title}</div>
          <div className="text-xs text-slate-500">{text}</div>
        </div>
        {add}
      </div>
      <div className="mt-3 grid gap-2">{children.length ? children : <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Kimse yok · yönetim yapar</div>}</div>
    </div>
  );
}
