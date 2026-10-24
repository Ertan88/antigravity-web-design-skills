import { ADMIN_ONLY_PERMISSIONS, createMemberSchema, PERMISSION_KEYS, PERMISSIONS, updateMemberSchema, type Permission, type Role } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { KeyRound, Pencil, Plus, UserCog } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Card, DeleteButton, EmptyState, Field, IconButton, Input, Modal, PageHeader, Spinner, Table, Td } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useSchoolPath } from '../lib/data.ts';
import { useForm } from '../lib/form.ts';
import { timeAgo } from '../lib/format.ts';

interface Member {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  permissions: string[];
  effectivePermissions: Permission[];
  lastLoginAt: string | null;
}

const GRANTABLE = PERMISSION_KEYS.filter((p) => !ADMIN_ONLY_PERMISSIONS.includes(p));
const ROLE_INFO: Record<'admin' | 'editor', { title: string; text: string }> = {
  admin: { title: 'Yönetici', text: 'Tüm bölümleri düzenler, kullanıcı ekler ve yetki verir.' },
  editor: { title: 'Editör', text: 'Yalnızca aşağıda seçtiğiniz bölümleri düzenleyebilir.' },
};

function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

type Form = { email: string; fullName: string; password: string; role: 'admin' | 'editor'; permissions: Permission[] };

function RoleAndPermissions({ form }: { form: ReturnType<typeof useForm<Form>> }) {
  const { values: v, set } = form;
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['editor', 'admin'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => set('role', r)}
            className={clsx(
              'rounded-xl p-3.5 text-left ring-1 transition-colors',
              v.role === r ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-200 hover:bg-slate-50',
            )}
          >
            <div className="text-sm font-semibold">{ROLE_INFO[r].title}</div>
            <div className="mt-0.5 text-xs text-slate-500">{ROLE_INFO[r].text}</div>
          </button>
        ))}
      </div>
      {v.role === 'editor' && (
        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Düzenleyebileceği bölümler</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {GRANTABLE.map((p) => {
              const on = v.permissions.includes(p);
              return (
                <label key={p} className={clsx('flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm ring-1', on ? 'bg-brand-50 ring-brand-200' : 'ring-slate-200 hover:bg-slate-50')}>
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-600"
                    checked={on}
                    onChange={() => set('permissions', on ? v.permissions.filter((x) => x !== p) : [...v.permissions, p])}
                  />
                  {PERMISSIONS[p]}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export function Users() {
  const { me, schoolId } = useAuth();
  const path = useSchoolPath('members');
  const qc = useQueryClient();
  const toast = useToast();
  const list = useList<Member>('members');
  const [mode, setMode] = useState<'add' | Member | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const form = useForm<Form>({ email: '', fullName: '', password: '', role: 'editor', permissions: ['announcements.manage'] });
  const refresh = () => void qc.invalidateQueries({ queryKey: [schoolId, 'members'] });

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) => (id ? api(`${path}/${id}`, { method: 'PATCH', body }) : api(path, { method: 'POST', body })),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast.success('Kullanıcının okul erişimi kaldırıldı');
    },
    onError: (e) => toast.error(e.message),
  });

  const openAdd = () => {
    form.reset({ email: '', fullName: '', password: tempPassword(), role: 'editor', permissions: ['announcements.manage'] });
    setMode('add');
  };
  const openEdit = (m: Member) => {
    form.reset({ email: m.email, fullName: m.fullName, password: '', role: m.role === 'admin' ? 'admin' : 'editor', permissions: m.permissions as Permission[] });
    setMode(m);
  };

  const submit = async () => {
    const v = form.values;
    try {
      if (mode === 'add') {
        const payload = form.validate(createMemberSchema, { email: v.email, fullName: v.fullName, password: v.password || undefined, role: v.role, permissions: v.permissions });
        if (!payload) return;
        await save.mutateAsync({ body: payload });
        setCreated({ email: v.email, password: v.password });
        toast.success(`${v.fullName} eklendi`);
      } else if (mode) {
        const payload = form.validate(updateMemberSchema, { role: v.role, permissions: v.permissions });
        if (!payload) return;
        await save.mutateAsync({ id: mode.id, body: payload });
        toast.success('Yetkiler güncellendi');
      }
      refresh();
      setMode(null);
    } catch (err) {
      form.fail(err);
    }
  };

  return (
    <>
      <PageHeader
        title="Kullanıcılar ve Yetkiler"
        description="Öğretmen ve idarecilere panel erişimi verin. Editörler yalnızca seçtiğiniz bölümleri düzenleyebilir; örneğin bir öğretmen sadece duyuru ekleyebilir."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={openAdd}>
            Kullanıcı ekle
          </Button>
        }
      />
      <Card>
        {list.isLoading ? (
          <Spinner />
        ) : !list.data?.length ? (
          <EmptyState icon={<UserCog className="size-6" />} title="Kullanıcı yok" />
        ) : (
          <Table head={['Kullanıcı', 'Rol', 'Yetkiler', 'Son giriş', '']}>
            {list.data.map((m) => {
              const locked = m.role === 'owner' || m.userId === me?.user.id;
              return (
                <tr key={m.id}>
                  <Td>
                    <div className="font-semibold text-ink">{m.fullName}</div>
                    <div className="text-slate-500">{m.email}</div>
                  </Td>
                  <Td>
                    <Badge tone={m.role === 'editor' ? 'slate' : 'blue'}>{{ owner: 'Okul sahibi', admin: 'Yönetici', editor: 'Editör' }[m.role]}</Badge>
                  </Td>
                  <Td className="max-w-md">
                    {m.role === 'editor' ? (
                      m.effectivePermissions.length ? (
                        <div className="flex flex-wrap gap-1">
                          {m.effectivePermissions.map((p) => (
                            <span key={p} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                              {PERMISSIONS[p]}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">Yalnızca görüntüleme</span>
                      )
                    ) : (
                      <span className="text-slate-500">Tüm yetkiler</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">{timeAgo(m.lastLoginAt)}</Td>
                  <Td className="w-px text-right">
                    {!locked && (
                      <div className="flex justify-end">
                        <IconButton label="Yetkileri düzenle" onClick={() => openEdit(m)}>
                          <Pencil className="size-4" />
                        </IconButton>
                        <DeleteButton label="Erişimi kaldır" onConfirm={() => remove.mutate(m.id)} />
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        size="lg"
        title={mode === 'add' ? 'Kullanıcı ekle' : `${form.values.fullName} · yetkiler`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMode(null)}>
              Vazgeç
            </Button>
            <Button loading={save.isPending} onClick={() => void submit()}>
              Kaydet
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {form.errors._form && <Alert tone="red">{form.errors._form}</Alert>}
          {mode === 'add' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ad soyad" error={form.errors.fullName}>
                  {(id) => <Input id={id} value={form.values.fullName} onChange={(e) => form.set('fullName', e.target.value)} />}
                </Field>
                <Field label="E-posta" error={form.errors.email}>
                  {(id) => <Input id={id} type="email" value={form.values.email} onChange={(e) => form.set('email', e.target.value)} />}
                </Field>
              </div>
              <Field label="Geçici şifre" error={form.errors.password} help="Kullanıcı ilk girişten sonra Hesabım sayfasından değiştirebilir. E-posta sistemde kayıtlıysa mevcut şifresi geçerli kalır.">
                {(id) => (
                  <div className="flex gap-2">
                    <Input id={id} value={form.values.password} onChange={(e) => form.set('password', e.target.value)} className="font-mono" />
                    <Button variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => form.set('password', tempPassword())}>
                      Üret
                    </Button>
                  </div>
                )}
              </Field>
            </>
          )}
          <RoleAndPermissions form={form} />
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      <Modal open={Boolean(created)} onClose={() => setCreated(null)} title="Giriş bilgileri" footer={<Button onClick={() => setCreated(null)}>Tamam</Button>}>
        <div className="space-y-3 text-sm">
          <p>Bu bilgileri kullanıcıya güvenli bir yoldan iletin. Şifre bir daha gösterilmeyecek.</p>
          <div className="rounded-xl bg-slate-50 p-4 font-mono text-sm ring-1 ring-slate-200">
            <div>Adres: {location.origin}/admin/</div>
            <div>E-posta: {created?.email}</div>
            <div>Şifre: {created?.password}</div>
          </div>
        </div>
      </Modal>
    </>
  );
}
