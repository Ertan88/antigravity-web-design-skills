import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark, BrandName } from '../components/Brand.tsx';
import { Alert, Button, Field, Input, PasswordInput } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';
import { useSignupConfig } from './Public.tsx';

function MiniBoard() {
  // Giriş ekranındaki dekoratif pano çizimi (gerçek panonun 5 alanını yansıtır)
  return (
    <div className="aspect-video w-full max-w-lg rounded-2xl bg-slate-950/60 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <div className="mb-2 flex items-center justify-between px-1 text-[10px] text-white/70">
        <span>☀ 18°</span>
        <span className="font-bold text-white">Okulunuzun Adı</span>
        <span className="font-semibold tabular-nums text-white">09:42</span>
      </div>
      <div className="grid h-[calc(100%-2.75rem)] grid-cols-[1fr_2.2fr_1fr] gap-2">
        <div className="flex flex-col gap-2">
          <div className="flex-1 rounded-lg bg-brand-500/30" />
          <div className="flex-[1.4] rounded-lg bg-white/10" />
          <div className="flex-1 rounded-lg bg-amber-400/25" />
        </div>
        <div className="rounded-lg bg-gradient-to-br from-red-500/80 to-red-600/80" />
        <div className="flex flex-col gap-2">
          <div className="flex flex-1 items-center justify-center rounded-lg bg-brand-500/30 text-sm font-extrabold tabular-nums text-white">17:42</div>
          <div className="flex-[1.6] rounded-lg bg-white/10" />
        </div>
      </div>
      <div className="mt-2 h-4 rounded bg-white/10" />
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const signup = useSignupConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-slate-950 [--color-slate-300:#cbd5e1] [--color-slate-400:#94a3b8] [--color-slate-500:#64748b] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(800px_500px_at_0%_0%,rgba(31,139,173,0.4),transparent_60%),radial-gradient(600px_400px_at_100%_100%,rgba(245,158,11,0.18),transparent_60%)]" />
        <div className="relative flex items-center gap-2.5 text-white">
          <BrandMark className="size-10" />
          <BrandName className="text-xl font-extrabold tracking-tight" accent="text-[#F5B83D]" />
        </div>
        <div className="relative">
          <MiniBoard />
          <h2 className="mt-10 max-w-md text-3xl font-bold tracking-tight text-white">Okulunuzun tüm ekranları, tek panelden.</h2>
          <p className="mt-3 max-w-md text-slate-300">
            Duyurular, zil saatleri, nöbetçi öğretmenler ve sınav sayaçları; değişiklik yaptığınız anda koridordaki her ekranda.
          </p>
        </div>
        <div className="relative text-xs text-slate-500">© {new Date().getFullYear()} Panokul</div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden">
            <div className="mb-6 flex items-center gap-2.5">
              <BrandMark className="size-11" />
              <BrandName className="text-2xl font-extrabold tracking-tight text-ink" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Yönetim paneline giriş</h1>
            <p className="mt-1 text-sm text-slate-500">Okulunuzun size verdiği hesapla giriş yapın.</p>
          </div>
          {error && <Alert tone="red">{error}</Alert>}
          <Field label="E-posta">
            {(id) => (
              <Input
                id={id}
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@okul.k12.tr"
              />
            )}
          </Field>
          <Field label="Şifre">
            {(id) => (
              <PasswordInput
                id={id}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Giriş yap
          </Button>
          {signup.data && signup.data.mode !== 'closed' && (
            <p className="border-t border-slate-200/70 pt-5 text-center text-sm text-slate-500">
              Okulunuz Panokul kullanmıyor mu?{' '}
              <Link to="/kayit" className="font-semibold text-brand-600">
                {signup.data.trialDays} gün ücretsiz deneyin
              </Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
