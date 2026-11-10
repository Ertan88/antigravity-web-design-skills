import { applyPersonRole, errorText, normalizeName, PERSON_ROLES, type EnrollRole, type Person, type PersonRole } from '@okulpano/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth } from '../src/auth.tsx';
import { usePeople } from '../src/people.ts';
import { Sheet } from '../src/sheet.tsx';
import { Text } from '../src/text.tsx';
import { colors, radius } from '../src/theme.ts';
import { Avatar, Button, Card, Chip, Choice, Empty, ErrorNote, Field, Icon, Loading, Screen, SectionTitle, T } from '../src/ui.tsx';

type Method = 'invite' | 'code' | 'meeting' | 'password';
type RowRole = Exclude<PersonRole, 'owner'>;
interface Row {
  key: string;
  teacherId: string | null;
  fullName: string;
  sub: string;
  email: string;
  rosterEmail: string | null;
  role: RowRole;
}
type Result = { key: string; fullName: string; email: string; state: 'emailed' | 'link' | 'existing' | 'password' | 'code' | 'error'; value?: string; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const toEnroll = (r: RowRole): EnrollRole => (r === 'admin' ? 'admin' : r === 'counselor' ? 'counselor' : 'teacher');
const formatCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;
function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

/**
 * Hesap aç (paneldeki tek pencereyle aynı): 1) nasıl giriş yapacaklar (e-posta daveti, giriş kodu, toplantı QR'ı,
 * geçici şifre) 2) kimler (kadrodan ya da kadro dışı) ve rolleri. Görevler hesap açıldıktan sonra kişi ekranından verilir.
 */
export default function HesapAc() {
  const { kisi, ogretmen } = useLocalSearchParams<{ kisi?: string; ogretmen?: string }>();
  const { server, role: myRole } = useAuth();
  const ctx = usePeople();
  const isOwner = myRole === 'owner';
  const candidates = ctx.people.filter((p) => p.roster && (p.status === 'none' || p.status === 'code'));
  const toRow = (p: Person): Row => ({
    key: p.key,
    teacherId: p.teacherId,
    fullName: p.fullName,
    sub: p.sub,
    email: p.email ?? '',
    rosterEmail: p.email,
    role: (ctx.full && (p.role !== 'admin' || isOwner) ? p.role : p.teacherId ? 'teacher' : 'staff') as RowRole,
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [method, setMethod] = useState<Method>('invite');
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [extName, setExtName] = useState('');
  const [extEmail, setExtEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [seeded, setSeeded] = useState(false);

  // Kişi ekranından (?kisi) ya da eski bağlantıdan (?ogretmen) gelindiyse o kişi seçili gelir
  useEffect(() => {
    if (seeded || !ctx.people.length) return;
    const p = candidates.find((x) => x.key === kisi || x.teacherId === ogretmen);
    if (p) setRows([toRow(p)]);
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.people.length, seeded]);

  if (!ctx.allowed) {
    return (
      <Screen back title="Hesap aç">
        <Empty icon="lock-closed-outline" title="Bu ekran için yetkiniz yok" text="Okul müdüründen “Öğretmen hesabı açma” yetkisini isteyin." />
      </Screen>
    );
  }

  const external = rows.some((r) => !r.teacherId);
  const needsEmail = method === 'invite' || method === 'password';
  const emailOk = (r: Row) => EMAIL_RE.test(r.email.trim());
  const ready = method === 'code' ? rows.filter((r) => r.teacherId) : needsEmail ? rows.filter(emailOk) : [];
  const invalid = needsEmail && rows.some((r) => r.email.trim() && !emailOk(r));
  const set = (key: string, patch: Partial<Row>) => setRows((x) => x.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const roleChoices = (r: Row): RowRole[] => (ctx.full ? [r.teacherId ? 'teacher' : 'staff', 'counselor', ...(isOwner ? (['admin'] as const) : [])] : ['teacher']);
  const remaining = candidates.filter((p) => !rows.some((r) => r.key === p.key) && (!q || normalizeName(p.fullName).includes(normalizeName(q))));

  const meeting = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ url: string; expiresAt: string }>(`${ctx.enrollPath}/meeting`, { body: {} });
      router.push({ pathname: '/giris-kodu', params: { url: res.url, until: res.expiresAt } });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    const out: Result[] = [];
    for (const r of ready) {
      const email = r.email.trim().toLowerCase();
      try {
        if (method === 'code') {
          const res = await api<{ code: string; url: string; expiresAt: string }>(`${ctx.enrollPath}/code`, { body: { teacherId: r.teacherId, role: toEnroll(r.role) } });
          // Tek kişiye kod: tam ekran QR'lı kod ekranı
          if (ready.length === 1) {
            setBusy(false);
            ctx.refresh();
            router.replace({ pathname: '/giris-kodu', params: { code: res.code, url: res.url, until: res.expiresAt, name: r.fullName, role: PERSON_ROLES[r.role].label } });
            return;
          }
          out.push({ key: r.key, fullName: r.fullName, email, state: 'code', value: formatCode(res.code) });
        } else if (method === 'invite' && r.teacherId) {
          const res = await api<{ existingUser: boolean; emailed: boolean; inviteUrl: string | null }>(`${ctx.enrollPath}/invite`, {
            body: { teacherId: r.teacherId, role: toEnroll(r.role), ...(email !== (r.rosterEmail ?? '').toLowerCase() ? { email } : {}) },
          });
          out.push({ key: r.key, fullName: r.fullName, email, state: res.existingUser ? 'existing' : res.emailed ? 'emailed' : 'link', value: res.inviteUrl ?? undefined });
        } else {
          const password = method === 'password' ? tempPassword() : undefined;
          const res = await api<{ existingUser: boolean; invite?: { inviteUrl: string; emailed: boolean } | null }>(ctx.membersPath, {
            body: { email, fullName: r.fullName, invite: method === 'invite', password, ...applyPersonRole(r.role, []), teacherId: r.teacherId },
          });
          out.push(
            res.existingUser
              ? { key: r.key, fullName: r.fullName, email, state: 'existing' }
              : res.invite
                ? { key: r.key, fullName: r.fullName, email, state: res.invite.emailed ? 'emailed' : 'link', value: res.invite.inviteUrl }
                : { key: r.key, fullName: r.fullName, email, state: 'password', value: password },
          );
        }
      } catch (err) {
        out.push({ key: r.key, fullName: r.fullName, email, state: 'error', error: errorText(err, 'açılamadı') });
      }
    }
    setBusy(false);
    setResults(out);
    ctx.refresh();
  };

  if (results) {
    const panel = `${server.replace(/\/$/, '')}/admin/`;
    const share = results.filter((r) => r.value && r.state !== 'emailed');
    const message = share
      .map((r) => (r.state === 'password' ? `${r.fullName}: ${panel} · ${r.email} · şifre ${r.value}` : r.state === 'code' ? `${r.fullName}: giriş kodu ${r.value} (15 dakika geçerli)` : `${r.fullName}: ${r.value}`))
      .join('\n');
    const label: Record<Result['state'], string> = {
      emailed: 'Davet e-postayla gönderildi',
      link: 'E-posta gitmedi: bağlantıyı paylaşın',
      existing: 'Mevcut hesabıyla okula eklendi',
      password: 'Geçici şifre: güvenli bir yoldan iletin',
      code: 'Giriş kodu: 15 dakika geçerli',
      error: '',
    };
    return (
      <Screen back title="Hesap açma sonucu" footer={<Button onPress={() => router.back()}>Tamam</Button>}>
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {results.map((r, i) => (
            <View key={r.key} style={{ paddingVertical: 11, gap: 4, borderBottomWidth: i === results.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
              <T weight="800">{r.fullName}</T>
              {r.email ? (
                <T size={12.5} color={colors.muted}>
                  {r.email}
                </T>
              ) : null}
              <T size={12.5} weight="700" color={r.state === 'error' ? colors.danger : r.state === 'emailed' || r.state === 'existing' ? colors.success : colors.warning}>
                {r.error ?? label[r.state]}
              </T>
              {r.value && r.state !== 'emailed' && (
                <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: 10 }}>
                  <Text selectable style={{ fontSize: r.state === 'code' ? 24 : 12.5, fontWeight: r.state === 'code' ? '800' : '500', letterSpacing: r.state === 'code' ? 3 : 0, textAlign: r.state === 'code' ? 'center' : 'left', color: colors.ink }}>
                    {r.value}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </Card>
        {share.length > 0 && (
          <Button variant="secondary" icon="share-outline" onPress={() => void Share.share({ message })}>
            Hepsini paylaş
          </Button>
        )}
      </Screen>
    );
  }

  const methods: { value: Method; label: string; description: string }[] = [
    { value: 'invite', label: 'E-posta daveti', description: 'Bağlantı gider, şifresini kendisi belirler' },
    { value: 'code', label: 'Giriş kodu', description: external ? 'Kadro dışı kişiye verilemez' : 'Telefondan kodla girer; e-posta gerekmez' },
    { value: 'meeting', label: 'Toplantı QR’ı', description: 'Herkes kendi açar, siz onaylarsınız' },
    ...(ctx.full ? [{ value: 'password' as const, label: 'Geçici şifre', description: 'Şifre üretilir, siz iletirsiniz' }] : []),
  ];
  const sendLabel = `${ready.length ? `${ready.length} ` : ''}${method === 'code' ? 'giriş kodu ver' : method === 'password' ? 'hesap aç' : 'davet gönder'}`;

  return (
    <Screen
      back
      title="Hesap aç"
      subtitle={candidates.length ? `${candidates.length} kişinin hesabı yok` : undefined}
      footer={
        method === 'meeting' ? (
          <Button icon="qr-code-outline" loading={busy} onPress={() => void meeting()}>
            Toplantı QR’ını göster
          </Button>
        ) : (
          <Button loading={busy} disabled={!ready.length || invalid || (method === 'code' && external)} onPress={() => void send()}>
            {sendLabel.charAt(0).toLocaleUpperCase('tr-TR') + sendLabel.slice(1)}
          </Button>
        )
      }
    >
      <ErrorNote error={ctx.error ?? error} />
      {ctx.loading ? (
        <Loading />
      ) : (
        <>
          <SectionTitle>1 · Nasıl giriş yapacaklar</SectionTitle>
          <Choice columns={2} value={method} onChange={(v) => (v === 'code' && external ? undefined : setMethod(v))} options={methods} />
          {method === 'invite' && !ctx.mail && (
            <T size={12.5} color={colors.warning} weight="600">
              E-posta gönderimi ayarlı değil: davetler oluşturulur, bağlantıları sonraki ekranda paylaşırsınız.
            </T>
          )}

          {method === 'meeting' ? (
            <Card>
              <T size={13.5}>Toplantıda ekrana yansıtın. Öğretmenler kadrodan adını seçer, hesaplar “Onay bekliyor” olarak düşer; Kişiler ve yetkiler ekranından onaylarsınız.</T>
            </Card>
          ) : (
            <>
              <SectionTitle>2 · Kimler</SectionTitle>
              {rows.map((r) => {
                const bad = needsEmail && r.email.trim() !== '' && !emailOk(r);
                const empty = needsEmail && !r.email.trim();
                return (
                  <Card key={r.key} style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Avatar name={r.fullName} size={38} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T weight="800" lines={1}>
                          {r.fullName}
                        </T>
                        <T size={12} color={colors.muted} lines={1}>
                          {r.sub}
                        </T>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel={`${r.fullName} çıkar`} hitSlop={10} onPress={() => setRows((x) => x.filter((y) => y.key !== r.key))}>
                        <Icon name="close" size={20} color={colors.muted} />
                      </Pressable>
                    </View>
                    {needsEmail && (
                      <Field
                        label="E-posta"
                        value={r.email}
                        onChangeText={(v) => set(r.key, { email: v })}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        placeholder="e-posta yazın"
                        error={bad ? 'E-posta geçersiz' : undefined}
                        help={empty ? (r.teacherId ? 'Kadroda yok · yazınca kadro kartına kaydedilir' : 'E-posta gerekli') : r.teacherId && r.email.trim().toLowerCase() !== (r.rosterEmail ?? '').toLowerCase() ? 'Kadro kartına kaydedilecek' : undefined}
                      />
                    )}
                    {roleChoices(r).length > 1 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {roleChoices(r).map((k) => (
                          <Chip key={k} label={PERSON_ROLES[k].label} selected={r.role === k} onPress={() => set(r.key, { role: k })} />
                        ))}
                      </View>
                    )}
                  </Card>
                );
              })}
              <Button variant="secondary" icon="person-add-outline" onPress={() => setPicking(true)} disabled={!candidates.length}>
                {candidates.length ? `Kadrodan ekle (${candidates.length - rows.filter((r) => r.teacherId).length} kişi)` : 'Kadroda hesabı olmayan kalmadı'}
              </Button>
              {ctx.full && method !== 'code' && (
                <Card style={{ gap: 8 }}>
                  <T size={13} weight="800" color={colors.muted}>
                    KADRO DIŞI KİŞİ (ör. memur)
                  </T>
                  <Field label="Ad soyad" value={extName} onChangeText={setExtName} />
                  <Field label="E-posta" value={extEmail} onChangeText={setExtEmail} keyboardType="email-address" autoCapitalize="none" />
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="add"
                    disabled={extName.trim().length < 2}
                    onPress={() => {
                      setRows((x) => [...x, { key: `x:${Date.now()}`, teacherId: null, fullName: extName.trim(), sub: 'Kadro dışı', email: extEmail.trim(), rosterEmail: null, role: 'staff' }]);
                      setExtName('');
                      setExtEmail('');
                    }}
                  >
                    Listeye ekle
                  </Button>
                </Card>
              )}
              <T size={12} color={colors.muted}>
                Görevler (duyurular, nöbet…) hesap açıldıktan sonra kişi ekranından verilir. E-posta başka bir okulda kayıtlıysa kişi bu okula eklenir ve kendi şifresiyle girer.
              </T>
            </>
          )}
        </>
      )}

      <Sheet open={picking} onClose={() => setPicking(false)}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>Kadrodan ekle</Text>
        <Field label="Ara" value={q} onChangeText={setQ} placeholder="Ad soyad" />
        <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 4, maxHeight: 420 }} keyboardShouldPersistTaps="handled">
          {remaining.map((p) => (
            <Pressable key={p.key} accessibilityRole="button" onPress={() => setRows((x) => [...x, toRow(p)])} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              <Avatar name={p.fullName} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T weight="700" size={14.5} lines={1}>
                  {p.fullName}
                </T>
                <T size={12} color={colors.muted} lines={1}>
                  {p.sub}
                </T>
              </View>
              <Icon name="add" size={20} color={colors.primary} />
            </Pressable>
          ))}
          {!remaining.length && (
            <T size={13.5} color={colors.muted} style={{ textAlign: 'center', padding: 16 }}>
              Eklenecek kişi kalmadı.
            </T>
          )}
        </ScrollView>
        <Button onPress={() => setPicking(false)} style={{ marginTop: 10 }}>
          Tamam
        </Button>
      </Sheet>
    </Screen>
  );
}
