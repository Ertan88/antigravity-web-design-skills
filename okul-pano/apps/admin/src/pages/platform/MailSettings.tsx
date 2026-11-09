import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { confirm } from '../../components/confirm.tsx';
import { Mail, MailCheck, Trash2 } from '../../components/icons.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, PasswordInput } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { formatDateTime } from '../../lib/format.ts';

interface MailView {
  source: 'env' | 'panel' | null;
  envConfigured: boolean;
  keyMask: string | null;
  from: string | null;
  broken: boolean;
  updatedAt: string | null;
}

/**
 * Platform yöneticisi: e-posta gönderim ayarı. Sunucuya erişmeden (ör. Render) Brevo API anahtarı ve gönderen adresi
 * buradan girilir. Anahtar şifreli saklanır, kaydedildikten sonra yalnızca son 4 hanesi görünür.
 */
export function MailSettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['platform', 'mail'], queryFn: () => api<MailView>('/api/platform/mail') });
  const [key, setKey] = useState('');
  const [fromName, setFromName] = useState('Okulyayın');
  const [fromEmail, setFromEmail] = useState('');

  useEffect(() => {
    const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(q.data?.from ?? '');
    if (m) {
      setFromName(m[1]!.trim());
      setFromEmail(m[2]!.trim());
    }
  }, [q.data?.from]);

  const from = `${fromName.trim() || 'Okulyayın'} <${fromEmail.trim()}>`;
  const body = () => ({ from, ...(key.trim() ? { brevoApiKey: key.trim() } : {}) });
  const save = useMutation({
    mutationFn: () => api<MailView>('/api/platform/mail', { method: 'PUT', body: body() }),
    onSuccess: (data) => {
      qc.setQueryData(['platform', 'mail'], data);
      setKey('');
      toast.success('E-posta ayarı kaydedildi');
    },
    onError: (e) => toast.error(e.message),
  });
  const test = useMutation({
    mutationFn: () => api<{ to: string }>('/api/platform/mail/test', { method: 'POST', body: body() }),
    onSuccess: (r) => toast.success(`Deneme e-postası ${r.to} adresine gönderildi. Gelen kutusuna ve istenmeyen klasörüne bakın.`),
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api('/api/platform/mail', { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'mail'] });
      setFromEmail('');
      toast.success('E-posta ayarı silindi');
    },
    onError: (e) => toast.error(e.message),
  });

  const d = q.data;
  const hasKey = Boolean(d?.keyMask);
  const emailOk = /.+@.+\..+/.test(fromEmail.trim());
  const canSend = emailOk && (hasKey || key.trim().length > 10);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="E-posta ayarları"
        description="Doğrulama kodları, davetler ve şifre yenileme e-postaları bu ayarla gönderilir. Sunucuya erişmeden buradan girilir; anahtar şifreli saklanır."
      />

      <Card className="p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Durum:</span>
          {d?.source === 'env' ? (
            <Badge tone="green" dot>
              Sunucu ortam değişkeniyle ayarlı
            </Badge>
          ) : d?.source === 'panel' ? (
            <Badge tone="green" dot>
              Etkin · {d.keyMask}
            </Badge>
          ) : (
            <Badge tone="amber" dot>
              Ayarlı değil · e-posta gönderilmiyor
            </Badge>
          )}
          {d?.updatedAt && <span className="text-xs text-slate-500">Son değişiklik: {formatDateTime(d.updatedAt)}</span>}
        </div>

        {d?.envConfigured && (
          <div className="mb-5">
            <Alert tone="blue">Sunucuda e-posta ortam değişkenleri tanımlı; onlar geçerlidir. Buradaki ayar yalnızca ortam değişkenleri kaldırılırsa kullanılır.</Alert>
          </div>
        )}
        {d?.broken && (
          <div className="mb-5">
            <Alert tone="red">Kayıtlı anahtar çözülemedi (sunucunun gizli anahtarı değişmiş olabilir). API anahtarını yeniden girip kaydedin.</Alert>
          </div>
        )}

        <div className="grid gap-4">
          <Field
            label="Brevo API anahtarı"
            help={
              hasKey
                ? `Kayıtlı anahtar ${d!.keyMask}. Değiştirmek istemiyorsanız boş bırakın.`
                : 'Brevo → sağ üstte hesap adı → SMTP & API → API Keys → “Generate a new API key”. “xkeysib-” ile başlar.'
            }
          >
            {(id) => <PasswordInput id={id} value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? d!.keyMask! : 'xkeysib-…'} autoComplete="off" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
            <Field label="Gönderen adı" help="E-postada “Kimden” olarak görünür">
              {(id) => <Input id={id} value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={60} />}
            </Field>
            <Field label="Gönderen e-posta" help="Brevo’da Senders bölümünde doğruladığınız adres">
              {(id) => <Input id={id} type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="ornek@gmail.com" invalid={Boolean(fromEmail) && !emailOk} />}
            </Field>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button icon={<Mail className="size-4" />} loading={save.isPending} disabled={!canSend} onClick={() => save.mutate()}>
            Kaydet
          </Button>
          <Button variant="secondary" icon={<MailCheck className="size-4" />} loading={test.isPending} disabled={!canSend} onClick={() => test.mutate()}>
            Deneme e-postası gönder
          </Button>
          {d?.source === 'panel' && (
            <Button
              variant="ghost"
              className="ml-auto text-red-600"
              icon={<Trash2 className="size-4" />}
              loading={remove.isPending}
              onClick={async () => {
                if (await confirm({ title: 'E-posta ayarı silinsin mi?', message: 'Doğrulama kodları ve davetler gönderilmez; hesaplar yetkilinin onayıyla açılır.', confirmLabel: 'Sil', tone: 'danger' })) remove.mutate();
              }}
            >
              Sil
            </Button>
          )}
        </div>
      </Card>

      <Card className="mt-5 p-6 text-sm text-slate-600">
        <h2 className="mb-2 text-base font-bold text-ink">Kendi alan adınız yoksa</h2>
        <p>
          Gönderen olarak Gmail adresi kullanılabilir; Brevo bu adrese bir onay e-postası gönderir. Ancak Gmail adresiyle başka bir sunucudan giden e-postalar
          bazı okullarda <strong>istenmeyen</strong> klasörüne düşebilir. Kalıcı çözüm, bir alan adı (ör. okulyayin.com) alıp Brevo’da doğrulamaktır; o zaman
          gönderen “bildirim@alanadınız” olur.
        </p>
      </Card>
    </div>
  );
}
