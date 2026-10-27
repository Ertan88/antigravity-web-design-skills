import { SCHOOL_TYPES } from '@okulpano/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrandMark, BrandName } from '../components/Brand.tsx';
import { Alert, Button, Field, Input, PasswordInput, Select, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';

interface SignupConfig {
  mode: 'open' | 'approval' | 'closed';
  trialDays: number;
  trialScreens: number;
}

export const useSignupConfig = () => useQuery({ queryKey: ['signup-config'], queryFn: () => api<SignupConfig>('/api/signup/config'), staleTime: 300_000 });

/** Giriş yapmadan açılan sayfaların ortak çerçevesi: logo, ortada tek kart */
function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-slate-50 px-4 py-10 sm:py-14">
      <Link to="/" className="mb-8 flex items-center gap-2.5" aria-label="Okulyayın girişine dön">
        <BrandMark className="size-10" />
        <BrandName className="text-2xl font-extrabold tracking-tight text-ink" />
      </Link>
      <main className={`w-full ${wide ? 'max-w-xl' : 'max-w-md'} rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-slate-900/[0.06] sm:p-8`}>{children}</main>
      <p className="mt-6 text-xs text-slate-500">© {new Date().getFullYear()} Okulyayın</p>
    </div>
  );
}

function Done({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">{icon}</div>
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <div className="space-y-3 text-sm text-slate-600">{children}</div>
    </div>
  );
}

/**
 * Okul için deneme kaydı. E-posta doğrulanınca okul deneme paketiyle açılır; kayıt yapan okul sahibi olur ve
 * öğretmenleri panelden davet eder. Mobil uygulamada kayıt yoktur.
 */
export function Signup() {
  const config = useSignupConfig();
  const [form, setForm] = useState({ schoolName: '', schoolType: '', city: '', district: '', ownerName: '', email: '', phone: '', password: '' });
  const [kvkk, setKvkk] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ emailed: boolean } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSent(await api<{ emailed: boolean }>('/api/signup', { method: 'POST', body: { ...form, district: form.district || null, kvkk, marketing, website } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  if (config.isLoading) return <PublicShell><Spinner /></PublicShell>;
  if (config.data?.mode === 'closed') {
    return (
      <PublicShell>
        <Done icon={<MailCheck className="size-7" />} title="Şu an yeni kayıt alınmıyor">
          <p>Okulunuz için Okulyayın kullanmak istiyorsanız bizimle iletişime geçin.</p>
          <Link to="/" className="font-semibold text-brand-600">Girişe dön</Link>
        </Done>
      </PublicShell>
    );
  }
  if (sent) {
    return (
      <PublicShell>
        <Done icon={<MailCheck className="size-7" />} title={sent.emailed ? 'E-postanızı kontrol edin' : 'Başvurunuz alındı'}>
          {sent.emailed ? (
            <p>
              <strong>{form.email}</strong> adresine bir doğrulama bağlantısı gönderdik. Bağlantıyı açınca okulunuz hazır olur. Gelen kutusunda yoksa
              istenmeyen e-postalara bakın; bağlantı 48 saat geçerlidir.
            </p>
          ) : (
            <p>Başvurunuzu aldık. Okulunuz hesabı açılınca {form.email} adresinden kayıtta belirlediğiniz şifreyle giriş yapabilirsiniz.</p>
          )}
          <Link to="/" className="font-semibold text-brand-600">Girişe dön</Link>
        </Done>
      </PublicShell>
    );
  }

  const days = config.data?.trialDays ?? 30;
  return (
    <PublicShell wide>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Okulunuz için ücretsiz deneyin</h1>
          <p className="mt-1 text-sm text-slate-500">
            {days} gün boyunca {config.data?.trialScreens ?? 2} panoya kadar ücretsiz. Kart bilgisi istenmez; deneme bitince aboneliği siz başlatırsınız.
          </p>
        </div>
        {error && <Alert tone="red">{error}</Alert>}

        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">Okul</legend>
          <Field label="Okulun tam adı" help="Panolarda bu ad görünür; sonra değiştirebilirsiniz.">
            {(id) => <Input id={id} required minLength={3} maxLength={120} value={form.schoolName} onChange={set('schoolName')} autoComplete="organization" />}
          </Field>
          <Field label="Okul türü">
            {(id) => (
              <Select id={id} required value={form.schoolType} onChange={set('schoolType')}>
                <option value="" disabled>
                  Seçin
                </option>
                {SCHOOL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="Diğer">Diğer</option>
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="İl">{(id) => <Input id={id} required minLength={2} maxLength={40} value={form.city} onChange={set('city')} autoComplete="address-level1" />}</Field>
            <Field label="İlçe">{(id) => <Input id={id} maxLength={60} value={form.district} onChange={set('district')} autoComplete="address-level2" />}</Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">Yetkili (okul sahibi hesabı)</legend>
          <Field label="Ad soyad">{(id) => <Input id={id} required minLength={3} maxLength={80} value={form.ownerName} onChange={set('ownerName')} autoComplete="name" />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="E-posta">{(id) => <Input id={id} type="email" required value={form.email} onChange={set('email')} autoComplete="email" />}</Field>
            <Field label="Telefon">{(id) => <Input id={id} type="tel" required value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="05xx xxx xx xx" />}</Field>
          </div>
          <Field label="Şifre" help="En az 8 karakter. Mobil uygulamaya da bu şifreyle girersiniz.">
            {(id) => <PasswordInput id={id} required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" />}
          </Field>
        </fieldset>

        {/* Bot tuzağı: ekran okuyucudan ve klavyeden gizli */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
          <label>
            Web sitesi
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2.5">
            <input type="checkbox" required className="mt-0.5 size-4 accent-brand-600" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} />
            <span className="text-slate-600">
              Kayıt için verdiğim ad, e-posta ve telefon bilgilerinin hesabın açılması, deneme süresi ve abonelik iletişimi için işlenmesine ilişkin
              aydınlatmayı okudum. <span className="text-slate-400">(zorunlu)</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            <span className="text-slate-600">Yenilikler ve kampanyalar hakkında e-posta almak istiyorum. (isteğe bağlı)</span>
          </label>
        </div>

        <Button type="submit" loading={busy} disabled={!kvkk} className="w-full">
          Ücretsiz denemeyi başlat
        </Button>
        <p className="text-center text-sm text-slate-500">
          Hesabınız var mı?{' '}
          <Link to="/" className="font-semibold text-brand-600">
            Giriş yapın
          </Link>
        </p>
      </form>
    </PublicShell>
  );
}

/** E-postadaki doğrulama bağlantısı: okulu açar */
export function VerifySignup() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<{ ok: boolean; message?: string; schoolName?: string; pendingApproval?: boolean } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ schoolName: string; pendingApproval: boolean }>('/api/signup/verify', { method: 'POST', body: { token } })
      .then((r) => setState({ ok: true, ...r }))
      .catch((err: Error) => setState({ ok: false, message: err.message }));
  }, [token]);

  return (
    <PublicShell>
      {!state ? (
        <Spinner />
      ) : state.ok ? (
        <Done icon={<CheckCircle2 className="size-7" />} title={state.pendingApproval ? 'E-postanız doğrulandı' : 'Okulunuz hazır'}>
          {state.pendingApproval ? (
            <p>{state.schoolName} için başvurunuz onaya gönderildi. Hesabınız açılınca e-posta ile haber vereceğiz.</p>
          ) : (
            <p>{state.schoolName} için deneme süreniz başladı. Kayıtta belirlediğiniz e-posta ve şifreyle giriş yapın.</p>
          )}
          <Link to="/" className="inline-block font-semibold text-brand-600">
            Giriş yap →
          </Link>
        </Done>
      ) : (
        <div className="space-y-4">
          <Alert tone="red">{state.message ?? 'Bağlantı geçersiz.'}</Alert>
          <Link to="/kayit" className="font-semibold text-brand-600">
            Yeniden kayıt ol
          </Link>
        </div>
      )}
    </PublicShell>
  );
}

/** Davet bağlantısı: kişi şifresini belirler ve giriş yapar */
export function AcceptInvite() {
  const { login } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<{ email: string; fullName: string; schoolName: string }>(`/api/invites/${encodeURIComponent(token)}`),
    retry: false,
  });
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== again) return setError('Şifreler aynı değil.');
    setBusy(true);
    setError(null);
    try {
      const { email } = await api<{ email: string }>('/api/invites/accept', { method: 'POST', body: { token, password } });
      window.history.replaceState(null, '', `${import.meta.env.BASE_URL}`);
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Şifre kaydedilemedi.');
      setBusy(false);
    }
  };

  return (
    <PublicShell>
      {invite.isLoading ? (
        <Spinner />
      ) : invite.error ? (
        <div className="space-y-4">
          <Alert tone="red">{invite.error instanceof Error ? invite.error.message : 'Davet bağlantısı geçersiz.'}</Alert>
          <Link to="/" className="font-semibold text-brand-600">
            Girişe dön
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Hoş geldiniz, {invite.data!.fullName}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {invite.data!.schoolName} sizi Okulyayın'a davet etti. Şifrenizi belirleyin; panele ve mobil uygulamaya <strong>{invite.data!.email}</strong> ile girersiniz.
            </p>
          </div>
          {error && <Alert tone="red">{error}</Alert>}
          <Field label="Şifre" help="En az 8 karakter">
            {(id) => <PasswordInput id={id} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
          </Field>
          <Field label="Şifre (tekrar)">
            {(id) => <PasswordInput id={id} required minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />}
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Şifremi kaydet ve giriş yap
          </Button>
        </form>
      )}
    </PublicShell>
  );
}
