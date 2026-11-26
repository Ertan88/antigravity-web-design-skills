import { confirm } from './confirm.tsx';
import { changePasswordSchema, errorText } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useForm } from '../lib/form.ts';
import { timeAgo } from '../lib/format.ts';
import { KeyRound, MonitorSmartphone, ShieldCheck } from './icons.tsx';
import { QrCode } from './QrCode.tsx';
import { useToast } from './Toast.tsx';
import { Alert, Button, Card, Field, Input, Modal, PasswordInput } from './ui.tsx';

/*
 * Hesabım › Güvenlik (9B): şifre, iki adımlı doğrulama (1C) ve açık oturumlar bir arada. Her biri bir satır;
 * işlem pencerede yapılır.
 */

interface SecurityInfo {
  mfa: { enabled: boolean; required: boolean; enabledAt: string | null; recoveryLeft: number };
  sessions: { id: string; device: string; lastUsedAt: string; current: boolean }[];
}

const KEY = ['me-security'];
export function useSecurity() {
  return useQuery({ queryKey: KEY, queryFn: () => api<SecurityInfo>('/api/me/security') });
}

function Row({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-slate-200/70 py-4 first:border-t-0 first:pt-0 last:pb-0 dark:border-white/10">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tile-sky text-tile-sky-ink">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-ink">{title}</div>
        <div className="text-sm text-slate-500">{detail}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function SecurityTab() {
  const { me } = useAuth();
  const sec = useSecurity();
  const [open, setOpen] = useState<'password' | 'mfa' | 'sessions' | null>(null);
  const mfa = sec.data?.mfa;
  const sessions = sec.data?.sessions ?? [];
  const others = sessions.filter((s) => !s.current);

  return (
    <div className="space-y-6">
      {me?.user.mfaRequired && !me.user.mfaEnabled && (
        <div className="max-w-2xl">
          <Alert tone="amber">Platform hesabında iki adımlı doğrulama zorunludur. Açana kadar platform sayfaları kapalı kalır.</Alert>
        </div>
      )}
      <Card className="max-w-2xl p-6">
        <Row icon={<KeyRound className="size-5" />} title="Şifre" detail="Değiştirince diğer cihazlardaki oturumlar kapanır." action={<Button variant="secondary" onClick={() => setOpen('password')}>Değiştir</Button>} />
        <Row
          icon={<ShieldCheck className="size-5" />}
          title="İki adımlı doğrulama"
          detail={
            !mfa
              ? '…'
              : mfa.enabled
                ? `Açık · doğrulayıcı uygulama · ${mfa.recoveryLeft} yedek kod`
                : mfa.required
                  ? 'Kapalı · bu hesapta zorunlu'
                  : 'Kapalı · girişte şifreden sonra uygulamadaki kod istenir'
          }
          action={
            <Button variant={mfa?.enabled ? 'secondary' : 'primary'} disabled={!mfa} onClick={() => setOpen('mfa')}>
              {mfa?.enabled ? 'Yönet' : 'Aç'}
            </Button>
          }
        />
        <Row
          icon={<MonitorSmartphone className="size-5" />}
          title="Açık oturumlar"
          detail={
            !sessions.length
              ? '…'
              : others.length
                ? `Bu cihazla birlikte ${sessions.length} cihazda açık. Bu cihaz: ${sessions.find((s) => s.current)?.device ?? '—'}`
                : `Yalnızca bu cihazda açık (${sessions.find((s) => s.current)?.device ?? '—'}).`
          }
          action={<Button variant="secondary" onClick={() => setOpen('sessions')}>Gör</Button>}
        />
      </Card>
      <PasswordDialog open={open === 'password'} onClose={() => setOpen(null)} />
      {mfa && (mfa.enabled ? <MfaManageDialog open={open === 'mfa'} onClose={() => setOpen(null)} required={mfa.required} /> : <MfaSetupDialog open={open === 'mfa'} onClose={() => setOpen(null)} />)}
      <SessionsDialog open={open === 'sessions'} onClose={() => setOpen(null)} sessions={sessions} others={others.length} />
    </div>
  );
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
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
      await qc.invalidateQueries({ queryKey: KEY });
      toast.success('Şifreniz değiştirildi; diğer cihazlardaki oturumlar kapatıldı');
      onClose();
    } catch (err) {
      form.fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Şifre değiştir"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" form="password-form" loading={busy}>Şifreyi güncelle</Button>
        </>
      }
    >
      <form id="password-form" onSubmit={submit} className="space-y-4">
        {form.errors._form && <Alert tone="red">{form.errors._form}</Alert>}
        {/* Tarayıcı kayıtlı şifreyi doğru hesaba göre doldursun */}
        <input type="email" name="username" autoComplete="username" value={me?.user.email ?? ''} readOnly hidden />
        <Field label="Mevcut şifre" error={form.errors.currentPassword}>
          {(id) => <PasswordInput id={id} autoComplete="current-password" value={form.values.currentPassword} onChange={(e) => form.set('currentPassword', e.target.value)} />}
        </Field>
        <Field label="Yeni şifre" error={form.errors.newPassword} help="En az 8 karakter">
          {(id) => <PasswordInput id={id} autoComplete="new-password" value={form.values.newPassword} onChange={(e) => form.set('newPassword', e.target.value)} />}
        </Field>
        <Field label="Yeni şifre (tekrar)" error={form.errors.repeat}>
          {(id) => <PasswordInput id={id} autoComplete="new-password" value={form.values.repeat} onChange={(e) => form.set('repeat', e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}

/** Yedek kodlar bir kez gösterilir: yazdır, kopyala, "Kaydettim" */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const toast = useToast();
  const text = codes.join('\n');
  const print = () => {
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) return;
    w.document.title = 'Okul Yayın yedek kodları';
    const pre = w.document.createElement('pre');
    pre.style.cssText = 'font:16px monospace;line-height:1.8;padding:24px';
    pre.textContent = `Okul Yayın · iki adımlı doğrulama yedek kodları\nHer biri bir kez çalışır.\n\n${text}`;
    w.document.body.appendChild(pre);
    w.print();
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">Telefonunuz kaybolursa bunlarla girersiniz. Her biri bir kez çalışır ve bir daha gösterilmez; güvenli bir yere kaydedin.</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-2xl bg-slate-100 p-4 font-mono text-[15px] text-ink dark:bg-white/5">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={print}>Yazdır</Button>
        <Button
          variant="secondary"
          onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success('Kopyalandı'), () => toast.error('Kopyalanamadı'))}
        >
          Kopyala
        </Button>
        <Button className="ml-auto" onClick={onDone}>Kaydettim</Button>
      </div>
    </div>
  );
}

function MfaSetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { adoptAccessToken } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState<'password' | 'scan' | 'codes'>('password');
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const close = () => {
    setStep('password');
    setPassword('');
    setSetup(null);
    setCode('');
    setError('');
    onClose();
  };
  const finish = async () => {
    // Erişim anahtarı "doğrulama açık" bilgisiyle yenilenir; platform sayfaları açılır
    if (newToken) await adoptAccessToken(newToken);
    await qc.invalidateQueries({ queryKey: KEY });
    toast.success('İki adımlı doğrulama açıldı');
    setCodes([]);
    close();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (step === 'password') {
        setSetup(await api<{ secret: string; otpauthUrl: string }>('/api/me/mfa/setup', { method: 'POST', body: { password } }));
        setPassword('');
        setStep('scan');
      } else if (step === 'scan') {
        const res = await api<{ recoveryCodes: string[]; accessToken: string }>('/api/me/mfa/enable', { method: 'POST', body: { code: code.replace(/\s/g, '') } });
        setCodes(res.recoveryCodes);
        setNewToken(res.accessToken);
        setStep('codes');
      }
    } catch (err) {
      setError(errorText(err, 'İşlem yapılamadı'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={step === 'codes' ? () => void finish() : close}
      title={step === 'codes' ? 'Yedek kodlarınız' : 'İki adımlı doğrulamayı aç'}
      description={step === 'password' ? 'Güvenlik için önce şifrenizi girin.' : undefined}
      footer={
        step === 'codes' ? undefined : (
          <>
            <Button variant="secondary" onClick={close}>Vazgeç</Button>
            <Button type="submit" form="mfa-setup-form" loading={busy} disabled={step === 'password' ? !password : code.replace(/\s/g, '').length !== 6}>
              {step === 'password' ? 'Devam et' : 'Doğrula ve aç'}
            </Button>
          </>
        )
      }
    >
      {step === 'codes' ? (
        <RecoveryCodes codes={codes} onDone={() => void finish()} />
      ) : (
        <form id="mfa-setup-form" onSubmit={submit} className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}
          {step === 'password' ? (
            <Field label="Şifre">
              {(id) => <PasswordInput id={id} autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
          ) : (
            setup && (
              <>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="w-fit shrink-0 rounded-2xl bg-white p-2 ring-1 ring-slate-200">
                    <QrCode value={setup.otpauthUrl} size={168} label="Doğrulayıcı uygulama için QR kod" />
                  </div>
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
                    <li>Telefonda doğrulayıcı uygulamayı açın (Google Authenticator, Microsoft Authenticator vb.).</li>
                    <li>QR kodu okutun. Okutamıyorsanız anahtarı elle girin.</li>
                    <li>Uygulamadaki 6 haneli kodu aşağıya yazın.</li>
                  </ol>
                </div>
                <div className="rounded-xl bg-slate-100 px-3 py-2 font-mono text-xs break-all text-ink select-all dark:bg-white/5">{setup.secret.match(/.{1,4}/g)?.join(' ')}</div>
                <Field label="Kod">
                  {(id) => (
                    <Input
                      id={id}
                      autoFocus
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={7}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                      className="text-center font-mono text-2xl tracking-[0.4em]"
                      placeholder="123456"
                    />
                  )}
                </Field>
              </>
            )
          )}
        </form>
      )}
    </Modal>
  );
}

function MfaManageDialog({ open, onClose, required }: { open: boolean; onClose: () => void; required: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState<'codes' | 'disable' | null>(null);
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    setAction(null);
    setPassword('');
    setCodes([]);
    setError('');
    onClose();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (action === 'codes') {
        const res = await api<{ recoveryCodes: string[] }>('/api/me/mfa/recovery-codes', { method: 'POST', body: { password } });
        setCodes(res.recoveryCodes);
      } else if (action === 'disable') {
        await api('/api/me/mfa/disable', { method: 'POST', body: { password } });
        toast.success('İki adımlı doğrulama kapatıldı');
        close();
      }
      setPassword('');
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (err) {
      setError(errorText(err, 'İşlem yapılamadı'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={codes.length ? 'Yeni yedek kodlarınız' : 'İki adımlı doğrulama'}
      footer={
        action && !codes.length ? (
          <>
            <Button variant="secondary" onClick={() => setAction(null)}>Vazgeç</Button>
            <Button type="submit" form="mfa-manage-form" variant={action === 'disable' ? 'danger' : 'primary'} loading={busy} disabled={!password}>
              {action === 'disable' ? 'Kapat' : 'Yeni kodlar oluştur'}
            </Button>
          </>
        ) : undefined
      }
    >
      {codes.length ? (
        <RecoveryCodes codes={codes} onDone={close} />
      ) : action ? (
        <form id="mfa-manage-form" onSubmit={submit} className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {action === 'disable' ? 'Kapatınca girişte yalnızca şifre istenir; hatırlanan cihazlar da unutulur.' : 'Eski yedek kodların hepsi geçersiz olur.'}
          </p>
          <Field label="Şifre">
            {(id) => <PasswordInput id={id} autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">Girişte şifreden sonra doğrulayıcı uygulamadaki kod istenir. "Bu cihazı 30 gün hatırla" seçilen cihazda 30 gün sorulmaz.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setAction('codes')}>Yeni yedek kodlar</Button>
            {!required && (
              <Button variant="delete" onClick={() => setAction('disable')}>
                Doğrulamayı kapat
              </Button>
            )}
          </div>
          {required && <p className="text-xs text-slate-500">Platform hesabında iki adımlı doğrulama kapatılamaz.</p>}
        </div>
      )}
    </Modal>
  );
}

function SessionsDialog({ open, onClose, sessions, others }: { open: boolean; onClose: () => void; sessions: SecurityInfo['sessions']; others: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: KEY });
      toast.success(ok);
    } catch (err) {
      toast.error(errorText(err, 'İşlem yapılamadı'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Açık oturumlar" description="Kaybolan ya da ortak bir cihazda açık kalan oturumu kapatın. Konum ve internet adresi tutulmaz.">
      <ul className="max-h-[50dvh] divide-y divide-slate-200/70 overflow-y-auto dark:divide-white/10">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tile-sky text-tile-sky-ink">
              <MonitorSmartphone className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                {s.device}
                {s.current && <span className="rounded-full bg-tile-mint px-2 py-0.5 text-xs font-bold text-tile-mint-ink">Bu cihaz</span>}
              </div>
              <div className="text-sm text-slate-500">{s.current ? 'Şu an kullanılıyor' : `Son kullanım: ${timeAgo(s.lastUsedAt)}`}</div>
            </div>
            {!s.current && (
              <Button size="sm" variant="delete" loading={busy === s.id} disabled={Boolean(busy)} onClick={async () => {
                  if (!(await confirm({ title: 'Bu oturum kapatılsın mı?', message: 'O cihazda yeniden giriş yapmak gerekir.', confirmLabel: 'Kapat', tone: 'warning' }))) return;
                  void run(s.id, () => api(`/api/me/sessions/${s.id}`, { method: 'DELETE' }), 'Oturum kapatıldı');
                }}>
                Kapat
              </Button>
            )}
          </li>
        ))}
      </ul>
      {others > 0 && (
        <div className="mt-4 space-y-1">
          <Button variant="delete" loading={busy === 'others'} disabled={Boolean(busy)} onClick={() => void run('others', () => api('/api/me/sessions/others', { method: 'POST', body: {} }), 'Diğer cihazlardaki oturumlar kapatıldı')}>
            Diğer bütün cihazlardan çık
          </Button>
          <p className="text-xs text-slate-500">Hatırlanan cihazlar da unutulur; oralarda yeniden girişte kod sorulur.</p>
        </div>
      )}
    </Modal>
  );
}
