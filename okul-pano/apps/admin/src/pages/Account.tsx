import { changePasswordSchema } from '@okulpano/shared';
import { useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { Alert, Button, Card, Field, PageHeader, PasswordInput } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useForm } from '../lib/form.ts';

export function Account() {
  const { me } = useAuth();
  const toast = useToast();
  const form = useForm({ currentPassword: '', newPassword: '', repeat: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = form.values;
    if (v.newPassword !== v.repeat) return form.setErrors({ repeat: 'Şifreler eşleşmiyor' });
    const payload = form.validate(changePasswordSchema, { currentPassword: v.currentPassword, newPassword: v.newPassword });
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
      <Card className="max-w-lg p-6">
        <h2 className="mb-4 font-semibold">Şifre değiştir</h2>
        <form onSubmit={submit} className="space-y-4">
          {form.errors._form && <Alert tone="red">{form.errors._form}</Alert>}
          {/* Tarayıcı kayıtlı şifreyi doğru hesaba göre doldursun (başka bir hesabın şifresini değil) */}
          <input type="email" name="username" autoComplete="username" value={me?.user.email ?? ''} readOnly hidden />
          <Field label="Mevcut şifre" error={form.errors.currentPassword} help="Tarayıcı kutuyu kendiliğinden doldurduysa göz simgesiyle kontrol edin.">
            {(id) => <PasswordInput id={id} autoComplete="current-password" value={form.values.currentPassword} onChange={(e) => form.set('currentPassword', e.target.value)} />}
          </Field>
          <Field label="Yeni şifre" error={form.errors.newPassword} help="En az 8 karakter">
            {(id) => <PasswordInput id={id} autoComplete="new-password" value={form.values.newPassword} onChange={(e) => form.set('newPassword', e.target.value)} />}
          </Field>
          <Field label="Yeni şifre (tekrar)" error={form.errors.repeat}>
            {(id) => <PasswordInput id={id} autoComplete="new-password" value={form.values.repeat} onChange={(e) => form.set('repeat', e.target.value)} />}
          </Field>
          <Button type="submit" loading={busy}>
            Şifreyi güncelle
          </Button>
        </form>
      </Card>
    </>
  );
}
