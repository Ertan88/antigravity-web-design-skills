import { errorText } from '@okulpano/shared';
import { BellRing, GraduationCap, Megaphone, MonitorSmartphone, ShieldCheck } from '../components/icons.tsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark, BrandName } from '../components/Brand.tsx';
import { Alert, Button, Field, Input, PasswordInput } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';
import { useSignupConfig } from './Public.tsx';

/** Giriş ekranının sol yarısı: uygulamanın ne yaptığını anlatan bento kutuları */
const FEATURES = [
  { icon: Megaphone, title: 'Duyurular', text: 'Onaylı, zamanlanmış', cls: 'bg-tile-sun text-tile-sun-ink' },
  { icon: BellRing, title: 'Zil saatleri', text: 'Bayram ve arife dahil', cls: 'bg-tile-sky text-tile-sky-ink' },
  { icon: ShieldCheck, title: 'Nöbet', text: 'İzinliye yerine görevli', cls: 'bg-tile-mint text-tile-mint-ink' },
  { icon: GraduationCap, title: 'Sınav sayacı', text: 'Gün gün geri sayım', cls: 'bg-tile-lilac text-tile-lilac-ink' },
];

export function Login() {
  const { login, loginWithCode } = useAuth();
  const signup = useSignupConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // İki adımlı doğrulama (1C): şifreden sonra kod adımı
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  // Ortak okul bilgisayarında hatırlanmasın diye kutu boş gelir
  const [remember, setRemember] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mfaToken) {
        await loginWithCode(mfaToken, { ...(useRecovery ? { recoveryCode: code.trim() } : { code: code.replace(/\s/g, '') }), remember });
        return;
      }
      const res = await login(email.trim(), password);
      if (res.mfaToken) {
        setMfaToken(res.mfaToken);
        setCode('');
      }
    } catch (err) {
      const msg = errorText(err, 'Giriş yapılamadı.');
      // Kod adımının süresi (5 dk) dolduysa şifre adımına dönülür
      if (mfaToken && /yeniden giriş/i.test(msg)) setMfaToken(null);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setMfaToken(null);
    setCode('');
    setUseRecovery(false);
    setError(null);
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between gap-10 bg-slate-100 p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-10" />
          <BrandName className="text-xl font-extrabold tracking-tight text-ink" />
        </div>
        <div>
          <h2 className="max-w-lg text-[44px] leading-[1.05] font-extrabold tracking-[-0.04em] text-ink">
            Okulunuzun her anı,
            <span className="block text-slate-400">tek ekranda.</span>
          </h2>
          <div className="mt-10 grid max-w-lg grid-cols-2 gap-3">
            <div className="col-span-2 flex items-center gap-4 rounded-3xl bg-tile-dark p-5 text-white">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10">
                <MonitorSmartphone className="size-6" />
              </span>
              <div>
                <div className="text-lg font-extrabold tracking-tight">Koridordaki her ekran</div>
                <div className="text-sm font-medium text-white/60">Değişiklik yaptığınız anda panolarda</div>
              </div>
            </div>
            {FEATURES.map((f) => (
              <div key={f.title} className={`rounded-3xl p-5 ${f.cls}`}>
                <f.icon className="size-6" />
                <div className="mt-6 text-base font-extrabold tracking-tight">{f.title}</div>
                <div className="text-[13px] font-semibold opacity-75">{f.text}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs font-medium text-slate-500">© {new Date().getFullYear()} Okulyayın</div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden">
            <div className="mb-6 flex items-center gap-2.5">
              <BrandMark className="size-11" />
              <BrandName className="text-2xl font-extrabold tracking-tight text-ink" />
            </div>
          </div>
          {mfaToken ? (
            <>
              <div>
                <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em]">{useRecovery ? 'Yedek kod' : 'Doğrulama kodu'}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  {useRecovery ? 'Kurulumda aldığınız yedek kodlardan birini girin. Her biri bir kez çalışır.' : 'Doğrulayıcı uygulamadaki 6 haneli kodu girin.'}
                </p>
              </div>
              {error && <Alert tone="red">{error}</Alert>}
              <Field label={useRecovery ? 'Yedek kod' : 'Kod'}>
                {(id) => (
                  <Input
                    id={id}
                    autoFocus
                    required
                    autoComplete="one-time-code"
                    inputMode={useRecovery ? 'text' : 'numeric'}
                    maxLength={useRecovery ? 12 : 7}
                    value={code}
                    onChange={(e) => setCode(useRecovery ? e.target.value.toUpperCase() : e.target.value.replace(/[^\d ]/g, ''))}
                    placeholder={useRecovery ? 'ör. 7KQ2-M9XA' : '123456'}
                    className={useRecovery ? 'font-mono tracking-wider' : 'text-center font-mono text-2xl tracking-[0.4em]'}
                  />
                )}
              </Field>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" className="size-4 accent-brand-600" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Bu cihazı 30 gün hatırla
              </label>
              <p className="-mt-3 text-xs text-slate-500">Ortak kullanılan bilgisayarda işaretlemeyin.</p>
              <Button type="submit" loading={busy} className="w-full">
                Giriş yap
              </Button>
              <div className="flex justify-between text-sm">
                <button type="button" className="font-semibold text-slate-600 underline underline-offset-2 dark:text-slate-300" onClick={() => { setUseRecovery((v) => !v); setCode(''); setError(null); }}>
                  {useRecovery ? 'Doğrulayıcı kodu kullan' : 'Yedek kod kullan'}
                </button>
                <button type="button" className="font-semibold text-slate-600 underline underline-offset-2 dark:text-slate-300" onClick={restart}>
                  Geri dön
                </button>
              </div>
            </>
          ) : (
          <>
          <div>
            <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em]">Yönetim paneline giriş</h1>
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
          </>
          )}
          {!mfaToken && signup.data && signup.data.mode !== 'closed' && (
            <p className="border-t border-slate-200/70 pt-5 text-center text-sm text-slate-500">
              Okulunuz Okulyayın kullanmıyor mu?{' '}
              <Link to="/kayit" className="font-bold text-ink underline underline-offset-2">
                {signup.data.trialDays} gün ücretsiz deneyin
              </Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
