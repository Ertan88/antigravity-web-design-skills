import { updateProfileSchema } from '@okulpano/shared';
import { useState } from 'react';
import { LinkedAccountCard } from '../components/AccountSwitch.tsx';
import { useToast } from '../components/Toast.tsx';
import { useSearchParams } from 'react-router-dom';
import { SecurityTab } from '../components/Security.tsx';
import { Alert, Button, Card, Field, Input, PageHeader, PasswordInput, Segmented } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useForm } from '../lib/form.ts';

/** Profil bilgileri: ad soyad ve e-posta (e-posta değişikliği mevcut şifreyle onaylanır) */
function ProfileCard() {
  const { me, reloadMe } = useAuth();
  const toast = useToast();
  const form = useForm({
    fullName: me?.user.fullName ?? '',
    email: me?.user.email ?? '',
    currentPassword: '',
  });
  const [busy, setBusy] = useState(false);
  const emailChanged = form.values.email.trim().toLowerCase() !== (me?.user.email ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = form.values;
    const payload = form.validate(updateProfileSchema, {
      fullName: v.fullName,
      ...(emailChanged ? { email: v.email.trim(), currentPassword: v.currentPassword } : {}),
    });
    if (!payload) return;
    setBusy(true);
    try {
      await api('/api/me', { method: 'PATCH', body: payload });
      await reloadMe();
      form.set('currentPassword', '');
      toast.success('Profil bilgileriniz güncellendi');
    } catch (err) {
      form.fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-lg p-6">
      <h2 className="mb-4 font-semibold">Profil bilgilerim</h2>
      <form onSubmit={submit} className="space-y-4">
        {form.errors._form && <Alert tone="red">{form.errors._form}</Alert>}
        <Field label="Ad soyad" error={form.errors.fullName}>
          {(id) => <Input id={id} autoComplete="name" value={form.values.fullName} onChange={(e) => form.set('fullName', e.target.value)} />}
        </Field>
        <Field label="E-posta" error={form.errors.email}>
          {(id) => <Input id={id} type="email" autoComplete="email" value={form.values.email} onChange={(e) => form.set('email', e.target.value)} />}
        </Field>
        {emailChanged && (
          <Field label="Mevcut şifre" error={form.errors.currentPassword} help="E-postayı değiştirmek için şifrenizle onaylayın.">
            {(id) => (
              <PasswordInput
                id={id}
                autoComplete="current-password"
                value={form.values.currentPassword}
                onChange={(e) => form.set('currentPassword', e.target.value)}
              />
            )}
          </Field>
        )}
        <Button type="submit" loading={busy}>
          Kaydet
        </Button>
      </form>
    </Card>
  );
}

/** Hesabım (9B): Profil ve Güvenlik sekmeleri. Güvenlik'te şifre, iki adımlı doğrulama ve açık oturumlar. */
export function Account() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  // Platform yöneticisinde doğrulama zorunlu ve kapalıysa Güvenlik açılır
  const forced = Boolean(me?.user.mfaRequired && !me.user.mfaEnabled);
  const tab = params.get('sekme') === 'guvenlik' || forced ? 'security' : 'profile';

  return (
    <>
      <PageHeader title="Hesabım" description={`${me?.user.fullName} · ${me?.user.email}`} />
      <div className="mb-6">
        <Segmented
          value={tab}
          onChange={(v) => setParams(v === 'security' ? { sekme: 'guvenlik' } : {}, { replace: true })}
          options={[
            { value: 'profile', label: 'Profil' },
            { value: 'security', label: 'Güvenlik' },
          ]}
        />
      </div>
      {tab === 'profile' ? (
        <div className="space-y-6">
          <ProfileCard />
          <LinkedAccountCard />
        </div>
      ) : (
        <SecurityTab />
      )}
    </>
  );
}
