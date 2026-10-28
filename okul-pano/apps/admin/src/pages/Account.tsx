import { changePasswordSchema, updateProfileSchema } from '@okulpano/shared';
import { useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { Alert, Button, Card, Field, Input, PageHeader, PasswordInput } from '../components/ui.tsx';
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

export function Account() {
  const { me } = useAuth();
  const toast = useToast();
  const form = useForm({ currentPassword: '', newPassword: '', repeat: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = form.values;
    if (v.newPassword !== v.repeat) return form.setErrors({ repeat: 'Şifreler eşleşmiyor' });
    const payload = form.validate(changePasswordSchema, {
      currentPassword: v.currentPassword,
      newPassword: v.newPassword,
    });
    if (!payload) return;
    setBusy(true);
    try {
      await api('/api/me/password', { method: 'POST', body: payload });
      form.reset({ currentPassword: '', newPassword: '', repeat: '' });
      toast.success('Şifreniz değiştirildi; diğer cihazlardaki oturumlar kapatıldı');
    } catch (err) {
      form.fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Hesabım" description={`${me?.user.fullName} · ${me?.user.email}`} />
      <div className="space-y-6">
        <ProfileCard />
        <Card className="max-w-lg p-6">
          <h2 className="mb-4 font-semibold">Şifre değiştir</h2>
          <form onSubmit={submit} className="space-y-4">
            {form.errors._form && <Alert tone="red">{form.errors._form}</Alert>}
            {/* Tarayıcı kayıtlı şifreyi doğru hesaba göre doldursun (başka bir hesabın şifresini değil) */}
            <input type="email" name="username" autoComplete="username" value={me?.user.email ?? ''} readOnly hidden />
            <Field label="Mevcut şifre" error={form.errors.currentPassword} help="Tarayıcı kutuyu kendiliğinden doldurduysa göz simgesiyle kontrol edin.">
              {(id) => (
                <PasswordInput
                  id={id}
                  autoComplete="current-password"
                  value={form.values.currentPassword}
                  onChange={(e) => form.set('currentPassword', e.target.value)}
                />
              )}
            </Field>
            <Field label="Yeni şifre" error={form.errors.newPassword} help="En az 8 karakter">
              {(id) => (
                <PasswordInput id={id} autoComplete="new-password" value={form.values.newPassword} onChange={(e) => form.set('newPassword', e.target.value)} />
              )}
            </Field>
            <Field label="Yeni şifre (tekrar)" error={form.errors.repeat}>
              {(id) => <PasswordInput id={id} autoComplete="new-password" value={form.values.repeat} onChange={(e) => form.set('repeat', e.target.value)} />}
            </Field>
            <Button type="submit" loading={busy}>
              Şifreyi güncelle
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
