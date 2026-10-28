import { createSchoolSchema, PLANS, trialStatus, type Plan } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Download, Inbox, Lock, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, Spinner, Table, Td, Toggle } from '../components/ui.tsx';
import { downloadJson } from '../lib/download.ts';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import type { School } from '../lib/data.ts';
import { useForm } from '../lib/form.ts';
import { formatDate, formatDateTime, slugify } from '../lib/format.ts';
import { AcademicCalendarCard } from './platform/AcademicCalendarCard.tsx';

type Row = School & {
  screenCount: number;
  contactPhone: string | null;
  createdAt: string;
  /** Platform yöneticisi bu okulun üyesi (kendi okulu) */
  member: boolean;
  /** Okul verileri panelde açılabilir: üyelik ya da süreli destek erişimi (KVKK) */
  canOpen: boolean;
};

interface Signup {
  id: string;
  schoolName: string;
  schoolType: string;
  city: string;
  district: string | null;
  ownerName: string;
  email: string;
  phone: string;
  marketingConsent: boolean;
  createdAt: string;
  expired: boolean;
}

type Form = { name: string; slug: string; plan: Plan; maxScreens: number; ownerEmail: string; ownerName: string; ownerPassword: string };
const empty: Form = { name: '', slug: '', plan: 'trial', maxScreens: 3, ownerEmail: '', ownerName: '', ownerPassword: '' };

/** SaaS sahibi için: okul (müşteri) oluşturma, paket ve ekran limiti yönetimi. Ödeme entegrasyonu bir sonraki aşamada. */
export function Platform() {
  const { reloadMe } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['platform', 'schools'], queryFn: () => api<Row[]>('/api/platform/schools') });
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [confirmSlug, setConfirmSlug] = useState('');
  const form = useForm<Form>(empty);
  const v = form.values;

  const create = useMutation({ mutationFn: (body: unknown) => api('/api/platform/schools', { method: 'POST', body }) });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<School, 'plan' | 'maxScreens' | 'isActive'>> & { extendTrialDays?: number } }) =>
      api(`/api/platform/schools/${id}`, { method: 'PATCH', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform', 'schools'] }),
    onError: (e) => toast.error(e.message),
  });

  // Web'den gelen, e-postası doğrulanmamış başvurular (SMTP yoksa e-posta gitmez: buradan elle onaylanır)
  const signups = useQuery({ queryKey: ['platform', 'signups'], queryFn: () => api<Signup[]>('/api/platform/signups') });
  const approve = useMutation({
    mutationFn: (x: Signup) => api(`/api/platform/signups/${x.id}/approve`, { method: 'POST' }),
    onSuccess: async (_r, x) => {
      toast.success(`${x.schoolName} açıldı; ${x.email} kayıtta belirlediği şifreyle girebilir`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['platform'] }), reloadMe()]);
    },
    onError: (e) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: (x: Signup) => api(`/api/platform/signups/${x.id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform', 'signups'] }),
    onError: (e) => toast.error(e.message),
  });

  // KVKK: abonelik bitince okul bütün verileriyle silinir (önce dışa aktarılıp okula teslim edilebilir)
  const remove = useMutation({
    mutationFn: (s: Row) => api<{ removedUsers: number }>(`/api/platform/schools/${s.id}`, { method: 'DELETE', body: { confirmSlug } }),
    onSuccess: async (r, s) => {
      toast.success(`${s.name} ve bütün verileri silindi${r.removedUsers ? ` · ${r.removedUsers} kullanıcı hesabı da kaldırıldı` : ''}`);
      setDeleting(null);
      await qc.invalidateQueries({ queryKey: ['platform', 'schools'] });
      await reloadMe();
    },
    onError: (e) => toast.error(e.message),
  });
  const exportSchool = async (s: Row) => {
    try {
      downloadJson(await api(`/api/schools/${s.id}/export`), `okul-pano-${s.slug}-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dışa aktarılamadı');
    }
  };

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
        description="Platformdaki tüm okulların kayıt ve abonelik bilgileri. Okulların içeriğini (öğretmen, öğrenci, nöbet…) yalnızca kendi okulunuzda ya da okul yöneticisinin süreli destek erişimi verdiği okullarda açabilirsiniz (KVKK)."
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
      {(signups.data?.length ?? 0) > 0 && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5">
            <Inbox className="size-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-ink">E-postası doğrulanmamış kayıtlar ({signups.data!.length})</h2>
            <span className="text-xs text-slate-500">E-posta ulaşmadıysa buradan onaylayın; 30 gün sonra kendiliğinden silinir.</span>
          </div>
          <Table head={['Okul', 'Yetkili', 'İletişim', 'Tarih', '']}>
            {signups.data!.map((x) => (
              <tr key={x.id}>
                <Td>
                  <div className="font-semibold">{x.schoolName}</div>
                  <div className="text-xs text-slate-500">
                    {x.schoolType} · {[x.district, x.city].filter(Boolean).join(', ')}
                  </div>
                </Td>
                <Td>{x.ownerName}</Td>
                <Td>
                  <div>{x.email}</div>
                  <div className="text-xs text-slate-500">
                    {x.phone}
                    {x.marketingConsent && ' · ileti izni var'}
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-slate-500">
                  {formatDate(x.createdAt.slice(0, 10))}
                  {x.expired && <div className="text-xs">bağlantı süresi doldu</div>}
                </Td>
                <Td className="w-px">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" icon={<Check className="size-4" />} loading={approve.isPending && approve.variables?.id === x.id} onClick={() => approve.mutate(x)}>
                      Onayla
                    </Button>
                    <IconButton label="Başvuruyu sil" onClick={() => reject.mutate(x)}>
                      <Trash2 className="size-4 text-red-600" />
                    </IconButton>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <Card>
        {list.isLoading ? (
          <Spinner />
        ) : !list.data?.length ? (
          <EmptyState icon={<Building2 className="size-6" />} title="Henüz okul yok" />
        ) : (
          <Table head={['Okul', 'Paket', 'Ekran', 'Deneme bitişi', 'Aktif', '']}>
            {list.data.map((s) => (
              <tr key={s.id}>
                <Td>
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    {s.name}
                    {s.member ? (
                      <Badge tone="blue">Kendi okulunuz</Badge>
                    ) : s.canOpen ? (
                      <Badge tone="green">Destek erişimi · {s.supportAccessUntil ? formatDateTime(s.supportAccessUntil) : ''}</Badge>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400" title="Okul yöneticisi destek erişimi verirse açılır">
                        <Lock className="size-3" /> Veriler kapalı
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {s.slug}
                    {s.contactPhone && ` · ${s.contactPhone}`}
                  </div>
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
                <Td className="whitespace-nowrap text-slate-500">
                  {(() => {
                    const t = trialStatus(s);
                    if (!t) return '—';
                    return (
                      <div className="flex items-center gap-2">
                        <span>{formatDate(t.endsAt.slice(0, 10))}</span>
                        {t.expired ? <Badge tone="red">doldu</Badge> : t.daysLeft <= 7 && <Badge tone="amber">{t.daysLeft} gün</Badge>}
                        <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: s.id, body: { extendTrialDays: 30 } })}>
                          +30 gün
                        </Button>
                      </div>
                    );
                  })()}
                </Td>
                <Td>
                  <Toggle checked={s.isActive} onChange={(x) => patch.mutate({ id: s.id, body: { isActive: x } })} />
                </Td>
                <Td className="w-px">
                  <div className="flex justify-end">
                    {s.canOpen && (
                      <IconButton label="Verileri dışa aktar (JSON)" onClick={() => void exportSchool(s)}>
                        <Download className="size-4" />
                      </IconButton>
                    )}
                    <IconButton
                      label="Okulu ve bütün verilerini sil"
                      onClick={() => {
                        setConfirmSlug('');
                        setDeleting(s);
                      }}
                    >
                      <Trash2 className="size-4 text-red-600" />
                    </IconButton>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <AcademicCalendarCard />

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`${deleting?.name ?? ''} silinsin mi?`}
        description="Okul, bütün kayıtları (öğretmenler, öğrenciler, duyurular, görseller, etkinlik geçmişi) ve başka okulda üyeliği olmayan kullanıcı hesapları kalıcı olarak silinir. Geri alınamaz."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={remove.isPending} disabled={confirmSlug !== deleting?.slug} onClick={() => deleting && remove.mutate(deleting)}>
              Kalıcı olarak sil
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="amber">Silmeden önce verileri dışa aktarıp (indirme düğmesi) okula teslim etmeniz önerilir.</Alert>
          <Field label={`Onaylamak için okulun kısa adını yazın: ${deleting?.slug ?? ''}`}>
            {(id) => <Input id={id} value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} className="font-mono" autoComplete="off" />}
          </Field>
        </div>
      </Modal>

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
