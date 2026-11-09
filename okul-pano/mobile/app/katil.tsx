import { errorText } from '@okulpano/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, DEFAULT_SERVER, normalizeServer, session } from '../src/api.ts';
import { useAuth } from '../src/auth.tsx';
import { Text } from '../src/text.tsx';
import { colors } from '../src/theme.ts';
import { Button, Card, Field, Icon, Screen, T } from '../src/ui.tsx';

type Step = 'code' | 'pick' | 'email' | 'finish' | 'pending' | 'done';
interface Intro {
  token: string;
  schoolName: string;
  fullName: string;
  suggestedEmail: string | null;
  kind: 'code' | 'meeting';
}

/**
 * Hesap açma (oturum açmadan). İki yol:
 * - Giriş kodu: yetkilinin verdiği 8 haneli kod (ya da onun ekranındaki QR: ?kod=…)
 * - Toplantı QR'ı (?okul=…): kadrodan kendi adını seçer; hesap yetkili onaylayınca açılır
 * Ardından e-posta (doğrulama koduyla) ve şifre: ortada yazılı şifre ya da kullanıcı adı yoktur.
 */
export default function Katil() {
  const params = useLocalSearchParams<{ kod?: string; okul?: string }>();
  const { signIn, server: saved } = useAuth();
  const [server, setServer] = useState(saved || session.server || DEFAULT_SERVER);
  const [step, setStep] = useState<Step>(params.okul ? 'pick' : 'code');
  const [code, setCode] = useState(params.kod ?? '');
  const [teachers, setTeachers] = useState<{ id: string; fullName: string; branch: string | null; title: string | null }[] | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [q, setQ] = useState('');
  const [intro, setIntro] = useState<Intro | null>(null);
  const [email, setEmail] = useState('');
  const [verify, setVerify] = useState(false);
  const [existing, setExisting] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      if (!server.trim()) throw new Error('Sunucu adresini yazın (Okulyayın panelini açtığınız adres).');
      await session.setServer(server);
      await fn();
    } catch (err) {
      setError(errorText(err, 'İşlem yapılamadı'));
    } finally {
      setBusy(false);
    }
  };

  const startCode = () =>
    run(async () => {
      const res = await api<Intro>('/api/enroll/code', { body: { code: code.replace(/[^a-z0-9]/gi, '').toUpperCase() } });
      setIntro(res);
      setEmail(res.suggestedEmail ?? '');
      setStep('email');
    });

  // QR'dan gelindiyse kod kendiliğinden denenir; toplantı QR'ında öğretmen listesi yüklenir
  useEffect(() => {
    if (params.kod && server) void startCode();
    if (params.okul && server)
      void run(async () => {
        const res = await api<{ schoolName: string; teachers: NonNullable<typeof teachers> }>('/api/enroll/meeting', { body: { link: params.okul } });
        setSchoolName(res.schoolName);
        setTeachers(res.teachers);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (teacherId: string) =>
    run(async () => {
      const res = await api<Intro>('/api/enroll/meeting/start', { body: { link: params.okul, teacherId } });
      setIntro(res);
      setEmail(res.suggestedEmail ?? '');
      setStep('email');
    });

  const sendEmail = () =>
    run(async () => {
      const res = await api<{ existing: boolean; verify: boolean }>('/api/enroll/email', { body: { token: intro!.token, email: email.trim() } });
      setExisting(res.existing);
      setVerify(res.verify);
      setStep('finish');
    });

  const finish = () =>
    run(async () => {
      if (!existing && password !== password2) throw new Error('Şifreler aynı değil.');
      const res = await api<{ status: 'done' | 'pending'; email: string }>('/api/enroll/finish', {
        body: { token: intro!.token, ...(verify ? { emailCode: emailCode.trim() } : {}), ...(existing ? { existingPassword: password } : { password }) },
      });
      if (res.status === 'pending') return setStep('pending');
      setStep('done');
      await signIn(server, res.email, password);
    });

  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return (teachers ?? []).filter((t) => !needle || t.fullName.toLocaleLowerCase('tr-TR').includes(needle));
  }, [teachers, q]);

  const errorNote = error ? (
    <T color={colors.danger} weight="600" size={14}>
      {error}
    </T>
  ) : null;

  return (
    <Screen back title="Hesabımı aç" subtitle={intro?.schoolName || schoolName || 'Okulyayın'}>
      {!saved && !DEFAULT_SERVER && (
        <Field label="Sunucu adresi" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="ör. pano.okulunuz.k12.tr" onBlur={() => setServer(normalizeServer(server))} />
      )}

      {step === 'code' && (
        <Card style={{ gap: 14 }}>
          <T size={14} color={colors.muted}>
            Okul idaresinin ekranında gördüğünüz 8 haneli kodu yazın. Kod 15 dakika geçerlidir ve bir kez kullanılır.
          </T>
          <Field label="Giriş kodu" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={9} placeholder="ABCD-2345" style={{ fontSize: 22, letterSpacing: 4, fontWeight: '800' }} />
          {errorNote}
          <Button size="lg" loading={busy} disabled={code.replace(/[^a-z0-9]/gi, '').length < 8} onPress={() => void startCode()}>
            Devam
          </Button>
        </Card>
      )}

      {step === 'pick' && (
        <>
          <T size={14} color={colors.muted}>
            Listeden kendi adınızı seçin. Hesabınız okul idaresi onaylayınca açılır.
          </T>
          <Field label="Adınızı arayın" value={q} onChangeText={setQ} placeholder="ör. Ayşe" />
          {errorNote}
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {list.map((t, i) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void pick(t.id)}
                style={({ pressed }) => ({ paddingVertical: 12, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{t.fullName}</Text>
                <Text style={{ fontSize: 12.5, color: colors.muted }}>{[t.title, t.branch].filter(Boolean).join(' · ') || ' '}</Text>
              </Pressable>
            ))}
            {teachers && !list.length && (
              <T color={colors.muted} style={{ paddingVertical: 12 }}>
                Listede yoksanız hesabınız zaten açılmış olabilir; okul idaresine sorun.
              </T>
            )}
          </Card>
        </>
      )}

      {step === 'email' && intro && (
        <Card style={{ gap: 14 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>Merhaba {intro.fullName}</Text>
          <T size={14} color={colors.muted}>
            E-posta adresinizi yazın. Bundan sonra bu e-posta ve belirleyeceğiniz şifreyle giriş yapacaksınız; şifrenizi unutursanız yenileme bağlantısı buraya gelir.
          </T>
          <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
          {errorNote}
          <Button size="lg" loading={busy} disabled={!/.+@.+\..+/.test(email.trim())} onPress={() => void sendEmail()}>
            Devam
          </Button>
        </Card>
      )}

      {step === 'finish' && intro && (
        <Card style={{ gap: 14 }}>
          {existing ? (
            <T size={14} color={colors.muted}>
              {email} ile kayıtlı bir hesabınız var (ör. başka bir okuldan). O hesabın şifresini yazın; {intro.schoolName} hesabınıza eklenir.
            </T>
          ) : verify ? (
            <T size={14} color={colors.muted}>
              {email} adresine 6 haneli bir doğrulama kodu gönderdik (gelmediyse istenmeyen klasörüne bakın).
            </T>
          ) : null}
          {verify && <Field label="Doğrulama kodu" value={emailCode} onChangeText={setEmailCode} keyboardType="number-pad" maxLength={6} style={{ fontSize: 22, letterSpacing: 6, fontWeight: '800' }} />}
          <Field label={existing ? 'Hesabınızın şifresi' : 'Yeni şifre (en az 8 karakter)'} value={password} onChangeText={setPassword} secureTextEntry autoComplete={existing ? 'password' : 'new-password'} />
          {!existing && <Field label="Yeni şifre (tekrar)" value={password2} onChangeText={setPassword2} secureTextEntry autoComplete="new-password" />}
          {errorNote}
          <Button size="lg" loading={busy} disabled={(verify && emailCode.length < 6) || (existing ? !password : password.length < 8)} onPress={() => void finish()}>
            {intro.kind === 'meeting' ? 'Onaya gönder' : 'Hesabımı aç'}
          </Button>
          <Pressable accessibilityRole="button" onPress={() => setStep('email')} style={{ alignSelf: 'center', padding: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>E-postayı değiştir</Text>
          </Pressable>
        </Card>
      )}

      {step === 'pending' && (
        <Card style={{ gap: 12, alignItems: 'center' }}>
          <Icon name="time-outline" size={36} color={colors.warning} />
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>Onay bekleniyor</Text>
          <T size={14} color={colors.muted} style={{ textAlign: 'center' }}>
            Okul idaresi onaylayınca {email} ve belirlediğiniz şifreyle giriş yapabilirsiniz. Onaylandığında e-postayla da haber veririz.
          </T>
          <Button variant="secondary" onPress={() => router.replace('/login')}>
            Giriş ekranına dön
          </Button>
        </Card>
      )}

      {step === 'done' && (
        <Card style={{ gap: 12, alignItems: 'center' }}>
          <Icon name="checkmark-circle-outline" size={36} color={colors.success} />
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>Hesabınız açıldı</Text>
          {errorNote}
        </Card>
      )}
    </Screen>
  );
}
