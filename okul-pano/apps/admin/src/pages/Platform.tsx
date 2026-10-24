import { createSchoolSchema, PLANS, type Plan } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Toggle } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import type { School } from '../lib/data.ts';
import { useForm } from '../lib/form.ts';
import { formatDate, slugify } from '../lib/format.ts';

type Row = School & { screenCount: number; createdAt: string };

type Form = { name: string; slug: string; plan: Plan; maxScreens: number; ownerEmail: string; ownerName: string; ownerPassword: string };
const empty: Form = { name: '', slug: '', plan: 'trial', maxScreens: 3, ownerEmail: '', ownerName: '', ownerPassword: '' };

/** SaaS sahibi için: okul (müşteri) oluşturma, paket ve ekran limiti yönetimi. Ödeme entegrasyonu bir sonraki aşamada. */
export function Platform() {
  const { reloadMe } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['platform', 'schools'], queryFn: () => api<Row[]>('/api/platform/schools') });
  const [open, setOpen] = useState(false);
  const form = useForm<Form>(empty);
  const v = form.values;

  const create = useMutation({ mutationFn: (body: unknown) => api('/api/platform/schools', { method: 'POST', body }) });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<School, 'plan' | 'maxScreens' | 'isActive'>> }) =>
      api(`/api/platform/schools/${id}`, { method: 'PATCH', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform', 'schools'] }),
    onError: (e) => toast.error(e.message),
  });

  const submit = async () => {
    const payload = form.validate(createSchoolSchema, { ...v, ownerPassword: v.ownerPassword || undefined });
    if (!payload) return;
    try {
      await create.mutateAsync(payload);
      toast.success(`${v.name} oluşturuldu`);
      await qc.invalidateQueries({ queryKey: ['platform', 'schools'] });
      await reloadMe();
      setOpen(false);
    } catch (err) {
      form.fail(err);
    }
  };

  return (
    <>
      <PageHeader
        title="Okullar ve Abonelikler"
        description="Platformdaki tüm okullar. Paket ve ekran limitini buradan yönetin; ödeme altyapısı (iyzico / Stripe) bu alanların üzerine eklenecek."
        actions={
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => {
              form.reset(empty);
              setOpen(true);
            }}
          >
            Yeni okul
          </Button>
        }
      />
      <Card>
        {list.isLoading ? (
          <Spinner />
        ) : !list.data?.length ? (
          <EmptyState icon={<Building2 className="size-6" />} title="Henüz okul yok" />
        ) : (
          <Table head={['Okul', 'Paket', 'Ekran', 'Deneme bitişi', 'Aktif']}>
            {list.data.map((s) => (
              <tr key={s.id}>
                <Td>
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.slug}</div>
                </Td>
                <Td>
                  <Select value={s.plan} onChange={(e) => patch.mutate({ id: s.id, body: { plan: e.target.value as Plan } })} className="h-9 w-36" aria-label="Paket">
                    {Object.entries(PLANS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Badge tone={s.screenCount >= s.maxScreens ? 'amber' : 'slate'}>{s.screenCount}</Badge>
                    <span className="text-slate-400">/</span>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      defaultValue={s.maxScreens}
                      className="h-9 w-20"
                      aria-label="Ekran limiti"
                      onBlur={(e) => Number(e.target.value) !== s.maxScreens && patch.mutate({ id: s.id, body: { maxScreens: Number(e.target.value) } })}
                    />
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-slate-500">{s.plan === 'trial' && s.trialEndsAt ? formatDate(s.trialEndsAt.slice(0, 10)) : '—'}</Td>
                <Td>
                  <Toggle checked={s.isActive} onChange={(x) => patch.mutate({ id: s.id, body: { isActive: x } })} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Yeni okul"
        description="Okul ve okul sahibi hesabı birlikte oluşturulur."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button loading={create.isPending} onClick={() => void submit()}>
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {form.errors._form && <Alert tone="red">{form.errors._form}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Okul adı" error={form.errors.name}>
              {(id) => (
                <Input
                  id={id}
                  value={v.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    form.set('name', name);
                    if (!v.slug || v.slug === slugify(v.name)) form.set('slug', slugify(name));
                  }}
                />
              )}
            </Field>
            <Field label="Kısa ad" error={form.errors.slug}>
              {(id) => <Input id={id} value={v.slug} onChange={(e) => form.set('slug', e.target.value)} className="font-mono" />}
            </Field>
            <Field label="Paket">
              {(id) => (
                <Select id={id} value={v.plan} onChange={(e) => form.set('plan', e.target.value as Plan)}>
                  {Object.entries(PLANS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Ekran limiti" error={form.errors.maxScreens}>
              {(id) => <Input id={id} type="number" min={1} value={v.maxScreens} onChange={(e) => form.set('maxScreens', Number(e.target.value))} />}
            </Field>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <div className="mb-3 text-sm font-semibold">Okul sahibi (müdür)</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ad soyad" error={form.errors.ownerName}>
                {(id) => <Input id={id} value={v.ownerName} onChange={(e) => form.set('ownerName', e.target.value)} />}
              </Field>
              <Field label="E-posta" error={form.errors.ownerEmail}>
                {(id) => <Input id={id} type="email" value={v.ownerEmail} onChange={(e) => form.set('ownerEmail', e.target.value)} />}
              </Field>
              <Field label="Şifre" error={form.errors.ownerPassword} help="E-posta zaten kayıtlıysa boş bırakın" className="sm:col-span-2">
                {(id) => <Input id={id} value={v.ownerPassword} onChange={(e) => form.set('ownerPassword', e.target.value)} className="font-mono" />}
              </Field>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
