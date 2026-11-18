import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../lib/auth.tsx';
import { ArrowLeftRight } from './icons.tsx';
import { useToast } from './Toast.tsx';
import { Alert, Button, Card, Field, Input, Modal, PasswordInput } from './ui.tsx';

/*
 * Platform yöneticisinin web hesap geçişi: platform hesabı ↔ kendi bağlı okul hesabı. Yalnızca platform rolüne
 * açıktır; "Platform hesabına dön" yalnızca geçişle açılmış okul oturumunda görünür (sunucu karar verir).
 * Uç noktalar yalnızca panel çereziyle ve özel başlıkla çalışır.
 */

export interface LinkStatus {
  side: 'platform' | 'school' | 'none';
  linked: boolean;
  name?: string;
  schoolName?: string | null;
  needsPassword?: boolean;
}

class SwitchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'x-okul-switch': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SwitchError('Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.', 'network');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!res.ok) throw new SwitchError(data?.message ?? 'İşlem yapılamadı.', data?.error ?? 'error');
  return data as T;
}

export function useLinkedAccount() {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['linked-account', me?.user.id],
    queryFn: () => call<LinkStatus>('GET', '/api/auth/linked-account'),
    enabled: Boolean(me),
    staleTime: 60_000,
    retry: false,
  });
}

/** Yeni oturum çerezde; sayfa baştan yüklenir, oturum ve okul listesi temiz kurulur */
function reloadAfterSwitch() {
  window.location.assign(import.meta.env.BASE_URL);
}

/** Kenar menüde kullanıcı alanının üstündeki geçiş düğmesi */
export function AccountSwitchButton() {
  const status = useLinkedAccount().data;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [askPassword, setAskPassword] = useState(false);
  const [linking, setLinking] = useState(false);

  if (!status || status.side === 'none' || (status.side === 'school' && !status.linked)) return null;

  const toSchool = status.side === 'platform';
  const doSwitch = async (password?: string) => {
    setBusy(true);
    try {
      await call('POST', '/api/auth/switch-account', password ? { password } : {});
      reloadAfterSwitch();
    } catch (err) {
      setBusy(false);
      // Şifre penceresi hatayı kendi içinde gösterir
      if (password) throw err;
      if (err instanceof SwitchError && err.code === 'reauth') setAskPassword(true);
      else toast.error(err instanceof Error ? err.message : 'Hesap değiştirilemedi');
    }
  };

  const onClick = () => {
    if (!status.linked) setLinking(true);
    else if (status.needsPassword) setAskPassword(true);
    else void doSwitch();
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="mb-1 flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition hover:bg-slate-200/60 disabled:opacity-60 dark:hover:bg-white/5"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tile-mint text-tile-mint-ink">
          <ArrowLeftRight className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {toSchool ? (status.linked ? 'Okul hesabıma geç' : 'Okul hesabımı bağla') : 'Platform hesabına dön'}
          </span>
          {toSchool && status.linked && status.schoolName && <span className="block truncate text-xs text-slate-500">{status.schoolName}</span>}
        </span>
      </button>
      <ReauthDialog open={askPassword} onClose={() => setAskPassword(false)} onSubmit={doSwitch} />
      <LinkDialog open={linking} onClose={() => setLinking(false)} onLinked={() => void doSwitch()} />
    </>
  );
}

function ReauthDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (password: string) => Promise<void> }) {
  const { me } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Şifre doğrulanamadı');
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Şifrenizi girin"
      description="Son doğrulamanın üzerinden 12 saat geçti. Güvenlik için platform hesabınızın şifresi gerekiyor."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" form="reauth-form" loading={busy} disabled={!password}>
            Devam et
          </Button>
        </>
      }
    >
      <form id="reauth-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        {me?.user.isSuperAdmin && <input type="email" name="username" autoComplete="username" value={me.user.email} readOnly hidden />}
        <Field label="Platform hesabının şifresi">
          {(id) => <PasswordInput id={id} autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}

function LinkDialog({ open, onClose, onLinked }: { open: boolean; onClose: () => void; onLinked: () => void }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const status = await call<LinkStatus>('POST', '/api/auth/linked-account', { email: email.trim(), password });
      qc.setQueryData(['linked-account', me?.user.id], status);
      setPassword('');
      onClose();
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hesap bağlanamadı');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Okul hesabını bağla"
      description="Kendi okul hesabınızın e-postasını ve şifresini bir kez girin. Sonra tek dokunuşla geçersiniz; platform hesabınız okula üye olmaz."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" form="link-form" loading={busy} disabled={!email || !password}>
            Bağla ve geç
          </Button>
        </>
      }
    >
      <form id="link-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        <Field label="Okul hesabının e-postası">
          {(id) => <Input id={id} type="email" autoFocus autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Okul hesabının şifresi">
          {(id) => <PasswordInput id={id} autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}

/** Hesabım › Bağlı okul hesabı (yalnızca platform yöneticisi): bağlantıyı görme ve kaldırma */
export function LinkedAccountCard() {
  const { me } = useAuth();
  const { data: status } = useLinkedAccount();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  if (!me?.user.isSuperAdmin || !status || status.side !== 'platform') return null;

  const unlink = async () => {
    setBusy(true);
    try {
      await call('DELETE', '/api/auth/linked-account');
      qc.setQueryData(['linked-account', me.user.id], { side: 'platform', linked: false });
      toast.success('Bağlantı kaldırıldı');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bağlantı kaldırılamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-lg p-6">
      <h2 className="mb-1 font-semibold">Bağlı okul hesabı</h2>
      <p className="mb-4 text-sm text-slate-500">Kenar menüdeki düğmeyle platform hesabınız ile kendi okul hesabınız arasında geçiş yaparsınız.</p>
      {status.linked ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold text-ink">{status.name}</div>
            {status.schoolName && <div className="text-slate-500">{status.schoolName}</div>}
          </div>
          <Button variant="delete" loading={busy} onClick={() => void unlink()}>
            Bağlantıyı kaldır
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setLinking(true)}>
          Okul hesabımı bağla
        </Button>
      )}
      <LinkDialog open={linking} onClose={() => setLinking(false)} onLinked={() => toast.success('Okul hesabınız bağlandı')} />
    </Card>
  );
}
