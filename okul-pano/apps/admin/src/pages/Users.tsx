import { ADMIN_ONLY_PERMISSIONS, createMemberSchema, normalizeName, PERMISSION_KEYS, PERMISSIONS, updateMemberSchema, type Permission, type Role } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { KeyRound, Pencil, Plus, Send, UserCog } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Card, DeleteButton, EmptyState, Field, IconButton, Input, Modal, PageHeader, Segmented, Select, Spinner, Table, Td } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { CredentialsDialog, InviteDialog, ResetPasswordDialog, type Credentials, type InviteResult } from './users/Credentials.tsx';
import { useList, useSchoolPath, type Teacher } from '../lib/data.ts';
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
  /** Bağlı öğretmen kaydı: mobil uygulamada kendi nöbetleri ve ders programı görünür */
  teacherId: string | null;
  teacherName: string | null;
  lastLoginAt: string | null;
  /** Davetle eklendi, henüz şifresini belirlemedi */
  invitePending: boolean;
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

type Form = { email: string; fullName: string; password: string; invite: boolean; role: 'admin' | 'editor'; permissions: Permission[]; teacherId: string };

/** Kullanıcının bağlı olduğu öğretmen kaydı (mobil uygulama: "Bugün" ve "Nöbetlerim") */
function TeacherSelect({ value, onChange, teachers, id }: { value: string; onChange: (v: string) => void; teachers: Teacher[]; id?: string }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Öğretmen kaydı">
      <option value="">Öğretmen değil</option>
      {teachers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.fullName}
        </option>
      ))}
    </Select>
  );
}

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
  const teachers = useList<Teacher>('teachers');
  const teacherList = (teachers.data ?? []).filter((t) => t.isActive !== false);
  const linkTeacher = useMutation({
    mutationFn: ({ id, teacherId }: { id: string; teacherId: string | null }) => api(`${path}/${id}/teacher`, { method: 'PUT', body: { teacherId } }),
    onSuccess: (_d, v) => {
      refresh();
      toast.success(v.teacherId ? 'Öğretmen kaydı eşleştirildi: mobil uygulamada kendi nöbetleri ve programı görünür' : 'Öğretmen eşleşmesi kaldırıldı');
    },
    onError: (e) => toast.error(e.message),
  });
  const [mode, setMode] = useState<'add' | Member | null>(null);
  const [created, setCreated] = useState<Credentials | null>(null);
  const [invited, setInvited] = useState<InviteResult | null>(null);
  const [resetting, setResetting] = useState<Member | null>(null);
  const form = useForm<Form>({ email: '', fullName: '', password: '', invite: true, role: 'editor', permissions: ['announcements.manage'], teacherId: '' });
  const refresh = () => void qc.invalidateQueries({ queryKey: [schoolId, 'members'] });

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) => (id ? api(`${path}/${id}`, { method: 'PATCH', body }) : api(path, { method: 'POST', body })),
  });
  const reinvite = useMutation({
    mutationFn: (m: Member) => api<{ inviteUrl: string; emailed: boolean }>(`${path}/${m.id}/invite`, { method: 'POST' }).then((r) => ({ ...r, email: m.email, fullName: m.fullName })),
    onSuccess: (r) => setInvited(r),
    onError: (e) => toast.error(e.message),
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
    form.reset({ email: '', fullName: '', password: tempPassword(), invite: true, role: 'editor', permissions: ['announcements.manage'], teacherId: '' });
    setMode('add');
  };
  const openEdit = (m: Member) => {
    form.reset({ email: m.email, fullName: m.fullName, password: '', invite: false, role: m.role === 'admin' ? 'admin' : 'editor', permissions: m.permissions as Permission[], teacherId: m.teacherId ?? '' });
    setMode(m);
  };

  const submit = async () => {
    const v = form.values;
    try {
      if (mode === 'add') {
        const payload = form.validate(createMemberSchema, {
          email: v.email,
          fullName: v.fullName,
          password: v.invite ? undefined : v.password || undefined,
          invite: v.invite,
          role: v.role,
          permissions: v.permissions,
          teacherId: v.teacherId || null,
        });
        if (!payload) return;
        const res = (await save.mutateAsync({ body: payload })) as { existingUser?: boolean; invite?: { inviteUrl: string; emailed: boolean } | null };
        if (res.invite) {
          setInvited({ email: v.email, fullName: v.fullName, ...res.invite });
          toast.success(`${v.fullName} davet edildi`);
        } else if (res.existingUser) {
          // E-posta sistemde kayıtlı: girilen şifre kullanılmadı, kullanıcı kendi şifresiyle girer
          toast.success(`${v.fullName} eklendi. Bu e-posta sistemde zaten kayıtlı olduğu için mevcut şifresi geçerli; gerekirse "Şifreyi sıfırla"yı kullanın.`);
        } else {
          setCreated({ email: v.email, fullName: v.fullName, password: v.password });
          toast.success(`${v.fullName} eklendi`);
        }
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
          <Table head={['Kullanıcı', 'Rol', 'Yetkiler', 'Öğretmen kaydı', 'Son giriş', '']}>
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
                  <Td className="min-w-44">
                    <TeacherSelect
                      value={m.teacherId ?? ''}
                      teachers={teacherList}
                      onChange={(teacherId) => linkTeacher.mutate({ id: m.id, teacherId: teacherId || null })}
                    />
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">{m.invitePending ? <Badge tone="amber">Davet bekliyor</Badge> : timeAgo(m.lastLoginAt)}</Td>
                  <Td className="w-px text-right">
                    {!locked && (
                      <div className="flex justify-end">
                        <IconButton label="Yetkileri düzenle" onClick={() => openEdit(m)}>
                          <Pencil className="size-4" />
                        </IconButton>
                        {m.invitePending && (
                          <IconButton label="Daveti yeniden gönder" onClick={() => reinvite.mutate(m)}>
                            <Send className="size-4" />
                          </IconButton>
                        )}
                        <IconButton label="Şifreyi sıfırla" onClick={() => setResetting(m)}>
                          <KeyRound className="size-4" />
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
                  {(id) => (
                    <Input
                      id={id}
                      value={form.values.fullName}
                      onChange={(e) => {
                        form.set('fullName', e.target.value);
                        // Adı kadrodaki bir öğretmenle aynıysa öğretmen kaydı kendiliğinden seçilir
                        const match = teacherList.find((t) => normalizeName(t.fullName) === normalizeName(e.target.value));
                        if (match && !form.values.teacherId) form.set('teacherId', match.id);
                      }}
                    />
                  )}
                </Field>
                <Field label="E-posta" error={form.errors.email}>
                  {(id) => <Input id={id} type="email" value={form.values.email} onChange={(e) => form.set('email', e.target.value)} />}
                </Field>
              </div>
              <Field label="Giriş bilgisi" help={form.values.invite ? 'Kişiye bağlantı gider; şifresini kendisi belirler. E-posta sistemde kayıtlıysa mevcut şifresiyle girer.' : 'Kullanıcı ilk girişten sonra Hesabım sayfasından değiştirebilir. E-posta sistemde kayıtlıysa mevcut şifresi geçerli kalır.'}>
                {() => (
                  <Segmented
                    value={form.values.invite ? 'invite' : 'password'}
                    onChange={(v) => form.set('invite', v === 'invite')}
                    options={[
                      { value: 'invite', label: 'Davet bağlantısı gönder' },
                      { value: 'password', label: 'Geçici şifre ver' },
                    ]}
                  />
                )}
              </Field>
              {!form.values.invite && (
              <Field label="Geçici şifre" error={form.errors.password}>
                {(id) => (
                  <div className="flex gap-2">
                    <Input id={id} value={form.values.password} onChange={(e) => form.set('password', e.target.value)} className="font-mono" />
                    <Button variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => form.set('password', tempPassword())}>
                      Üret
                    </Button>
                  </div>
                )}
              </Field>
              )}
              <Field label="Öğretmen kaydı" help="Öğretmense seçin: mobil uygulamada kendi ders programını ve nöbetlerini görür, izin bildirebilir.">
                {(id) => <TeacherSelect id={id} value={form.values.teacherId} teachers={teacherList} onChange={(t) => form.set('teacherId', t)} />}
              </Field>
            </>
          )}
          <RoleAndPermissions form={form} />
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      <CredentialsDialog value={created} onClose={() => setCreated(null)} />
      <InviteDialog value={invited} onClose={() => setInvited(null)} />
      <ResetPasswordDialog
        member={resetting}
        onClose={() => setResetting(null)}
        onDone={(c) => {
          setResetting(null);
          setCreated(c);
          toast.success(c.emailed ? `${c.fullName} kullanıcısının şifresi sıfırlandı ve e-postayla gönderildi` : `${c.fullName} kullanıcısının şifresi sıfırlandı`);
        }}
      />
    </>
  );
}
