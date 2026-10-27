import { useMutation } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Mail } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Button, Field, Modal, PasswordInput, Toggle } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';

export interface Credentials {
  email: string;
  fullName: string;
  password: string;
  /** Sunucu e-postayı gönderdi mi (SMTP ayarlıysa) */
  emailed?: boolean;
}

const panelUrl = () => `${location.origin}/admin/`;

/** Kullanıcıya gidecek ileti: e-posta programında hazır açılır ya da kopyalanır */
function message(c: Credentials, schoolName: string) {
  return `Merhaba ${c.fullName},\n\n${schoolName} Panokul yönetim paneli giriş bilgileriniz:\n\nAdres: ${panelUrl()}\nE-posta: ${c.email}\nŞifre: ${c.password}\n\nGiriş yaptıktan sonra Hesabım sayfasından şifrenizi değiştirin.`;
}

/** Giriş bilgileri: kopyala ya da e-postayla gönder */
export function CredentialsDialog({ value, onClose }: { value: Credentials | null; onClose: () => void }) {
  const { school } = useAuth();
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const text = message(value, school?.name ?? '');
  const mailto = `mailto:${encodeURIComponent(value.email)}?subject=${encodeURIComponent(`${school?.name ?? ''} · Panokul şifreniz`)}&body=${encodeURIComponent(text)}`;
  return (
    <Modal open onClose={onClose} title="Giriş bilgileri" footer={<Button onClick={onClose}>Tamam</Button>}>
      <div className="space-y-3 text-sm">
        {value.emailed ? (
          <Alert tone="blue">Giriş bilgileri {value.email} adresine e-postayla gönderildi.</Alert>
        ) : (
          <p>Bu bilgileri kullanıcıya güvenli bir yoldan iletin. Şifre bir daha gösterilmeyecek.</p>
        )}
        <div className="rounded-xl bg-slate-50 p-4 font-mono text-sm ring-1 ring-slate-200">
          <div>Adres: {panelUrl()}</div>
          <div>E-posta: {value.email}</div>
          <div>Şifre: {value.password}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            onClick={() => {
              void navigator.clipboard?.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? 'Kopyalandı' : 'Bilgileri kopyala'}
          </Button>
          {!value.emailed && (
            <a href={mailto} className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-50">
              <Mail className="size-4" /> E-posta programında aç
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Şifre sıfırlama (kullanıcı şifresini unuttuysa): yeni şifre üretilir ya da yönetici yazar;
 * kullanıcının açık oturumları kapanır, istenirse e-postayla gönderilir.
 */
export function ResetPasswordDialog({
  member,
  onClose,
  onDone,
}: {
  member: { id: string; fullName: string; email: string } | null;
  onClose: () => void;
  onDone: (c: Credentials) => void;
}) {
  const path = useSchoolPath('members');
  const toast = useToast();
  const [own, setOwn] = useState(false);
  const [password, setPassword] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const reset = useMutation({
    mutationFn: () =>
      api<Credentials>(`${path}/${member!.id}/password`, { method: 'POST', body: { sendEmail, ...(own && password ? { password } : {}) } }),
    onSuccess: (c) => {
      setOwn(false);
      setPassword('');
      onDone(c);
    },
    onError: (e) => toast.error(e.message),
  });
  if (!member) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Şifreyi sıfırla"
      description={`${member.fullName} · ${member.email}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button icon={<KeyRound className="size-4" />} loading={reset.isPending} disabled={own && password.length < 8} onClick={() => reset.mutate()}>
            Şifreyi sıfırla
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Toggle checked={own} onChange={setOwn} label="Şifreyi ben belirleyeceğim" description="Kapalıyken okunaklı, güçlü bir şifre üretilir." />
        {own && (
          <Field label="Yeni şifre" help="En az 8 karakter">
            {(id) => <PasswordInput id={id} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
        )}
        <Toggle
          checked={sendEmail}
          onChange={setSendEmail}
          label="Kullanıcıya e-postayla gönder"
          description="Sunucuda e-posta (SMTP) ayarlı değilse bilgiler ekranda gösterilir; oradan e-posta programınızla tek tıkla gönderebilirsiniz."
        />
        <p className="text-xs text-slate-500">Kullanıcının açık oturumları kapanır; yeni şifreyle yeniden giriş yapması gerekir.</p>
      </div>
    </Modal>
  );
}
