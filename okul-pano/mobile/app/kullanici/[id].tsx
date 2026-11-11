import {
  applyPersonRole,
  DUTY_PACKAGES,
  dutiesOf,
  ENROLL_ROLES,
  EXTRA_PERMISSIONS,
  partialDutyPermissions,
  PERSON_ROLES,
  PERSON_STATUS,
  toggleDuty,
  type Person,
  type PersonRole,
} from '@okulpano/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '../../src/api.ts';
import { useAuth } from '../../src/auth.tsx';
import { useTeachers } from '../../src/data.ts';
import { timeAgo } from '../../src/day.ts';
import { AccessResult, TeacherPicker } from '../../src/members.tsx';
import { ROLE_BADGE, STATUS_BADGE, usePeople } from '../../src/people.ts';
import { colors } from '../../src/theme.ts';
import { Avatar, Badge, Button, Card, Chip, Choice, confirm, Empty, ErrorNote, Field, Loading, Screen, SectionTitle, T, ToggleRow } from '../../src/ui.tsx';

/** Kişi ekranı (paneldeki kişi kartı): hesap durumu ve işlemleri, rol, görevler, diğer yetkiler, kadro bağı */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctx = usePeople();
  // Eski bağlantılar (üyelik kimliği) de açılsın
  const p = ctx.people.find((x) => x.key === id || x.member?.id === id);
  return (
    <Screen back title={p?.fullName ?? 'Kişi'} subtitle={p?.sub} refreshing={ctx.refreshing} onRefresh={ctx.refresh}>
      <ErrorNote error={ctx.error} />
      {ctx.loading ? (
        <Loading />
      ) : !p ? (
        <Card>
          <Empty icon="person-outline" title="Kişi bulunamadı" />
        </Card>
      ) : (
        <Detail key={p.key} p={p} ctx={ctx} />
      )}
    </Screen>
  );
}

function Detail({ p, ctx }: { p: Person; ctx: ReturnType<typeof usePeople> }) {
  const { me, role: myRole } = useAuth();
  const iAmOwner = myRole === 'owner';
  const m = p.member;
  const teachers = useTeachers();
  const [role, setRole] = useState<PersonRole>(p.role);
  const [perms, setPerms] = useState<string[]>(m?.permissions ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<{ kind: 'password' | 'invite'; secret: string; emailed: boolean } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [own, setOwn] = useState(false);
  const [password, setPassword] = useState('');
  const [sendEmail, setSendEmail] = useState(true);

  useEffect(() => {
    setRole(p.role);
    setPerms(m?.permissions ?? []);
  }, [p.role, m?.permissions]);

  const isMe = m?.userId === me?.user.id;
  const editable = Boolean(m) && ctx.full && m!.role !== 'owner' && !isMe && (m!.role !== 'admin' || iAmOwner);
  const dirty = Boolean(m) && (role !== p.role || [...perms].sort().join() !== [...(m?.permissions ?? [])].sort().join());
  const duties = dutiesOf(perms);
  const partial = partialDutyPermissions(perms);
  const roleChoices: PersonRole[] = [...(iAmOwner || p.role === 'admin' ? (['admin'] as const) : []), 'counselor', p.teacherId ? 'teacher' : 'staff'];
  const st = PERSON_STATUS[p.status];
  const r = p.roster;

  const run = async (tag: string, fn: () => Promise<unknown>) => {
    setBusy(tag);
    setError(null);
    try {
      await fn();
      ctx.refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const giveCode = () =>
    run('code', async () => {
      const chosen = ctx.full && (p.role !== 'admin' || iAmOwner) ? (r?.role ?? 'teacher') : 'teacher';
      const res = await api<{ code: string; url: string; expiresAt: string }>(`${ctx.enrollPath}/code`, { body: { teacherId: p.teacherId, role: chosen } });
      router.push({ pathname: '/giris-kodu', params: { code: res.code, url: res.url, until: res.expiresAt, name: p.fullName, role: ENROLL_ROLES[chosen] } });
    });

  return (
    <>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={p.fullName} size={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="800" size={16}>
              {p.fullName}
            </T>
            <T size={12.5} color={colors.muted} lines={1}>
              {p.email ?? 'E-posta yok'}
            </T>
          </View>
          <Badge tone={ROLE_BADGE[p.role]}>{PERSON_ROLES[p.role].label}</Badge>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Badge tone={STATUS_BADGE[st.tone]}>{st.label}</Badge>
          <T size={12.5} color={colors.muted} style={{ flex: 1 }}>
            {p.status === 'account' && m
              ? m.lastLoginAt
                ? `son giriş ${timeAgo(m.lastLoginAt)}`
                : 'henüz giriş yapmadı'
              : p.status === 'invited'
                ? 'bağlantı henüz açılmadı'
                : p.status === 'code'
                  ? 'kod henüz kullanılmadı'
                  : p.status === 'pending'
                    ? 'toplantı QR’ı ile başvurdu'
                    : 'hesap açılmadı'}
          </T>
        </View>

        {(p.status === 'none' || p.status === 'code') && r && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="sm" icon="mail-outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/hesap-ac', params: { kisi: p.key } })}>
              Hesap aç
            </Button>
            <Button size="sm" variant="secondary" icon="key-outline" style={{ flex: 1 }} loading={busy === 'code'} onPress={() => void giveCode()}>
              Giriş kodu
            </Button>
          </View>
        )}
        {p.status === 'pending' && r?.enrollmentId && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="sm" variant="secondary" style={{ flex: 1 }} loading={busy === 'reject'} onPress={() => void run('reject', () => api(`${ctx.enrollPath}/${r.enrollmentId}/cancel`, { body: {} }))}>
              Reddet
            </Button>
            <Button size="sm" icon="checkmark" style={{ flex: 2 }} loading={busy === 'approve'} onPress={() => void run('approve', () => api(`${ctx.enrollPath}/${r.enrollmentId}/approve`, { body: ctx.full ? { role: r.role } : {} }))}>
              {`${ctx.full ? ENROLL_ROLES[r.role] : 'Öğretmen'} olarak onayla`}
            </Button>
          </View>
        )}
      </Card>

      {result && m && <AccessResult kind={result.kind} fullName={m.fullName} email={m.email} secret={result.secret} emailed={result.emailed} onDone={() => setResult(null)} />}
      <ErrorNote error={error} />

      {m && (
        <>
          <SectionTitle>Rol</SectionTitle>
          {m.role === 'owner' ? (
            <Card>
              <T weight="700">{PERSON_ROLES.owner.label}</T>
              <T size={12.5} color={colors.muted}>
                Bütün bölümleri düzenler. Müdürlüğü devretmek için web panelinde Kişiler ve Yetkiler'de kendi kartınızı açın.
              </T>
            </Card>
          ) : editable ? (
            <Card style={{ gap: 10 }}>
              <Choice
                columns={1}
                value={role}
                onChange={(v) => {
                  setRole(v);
                  setSaved(false);
                }}
                options={roleChoices.map((k) => ({ value: k, label: PERSON_ROLES[k].label, description: PERSON_ROLES[k].text }))}
              />
              {!iAmOwner && m.role === 'editor' && <Promotion p={p} ctx={ctx} busy={busy} run={run} />}
            </Card>
          ) : (
            <Card>
              <T weight="700">{PERSON_ROLES[p.role].label}</T>
              <T size={12.5} color={colors.muted}>
                {isMe ? 'Kendi rolünüzü değiştiremezsiniz.' : m.role === 'admin' ? 'Müdür yardımcısını yalnızca okul müdürü değiştirir.' : 'Bu kişinin rolünü değiştirme yetkiniz yok.'}
              </T>
            </Card>
          )}
          {iAmOwner && m.promotionRequest && <Promotion p={p} ctx={ctx} busy={busy} run={run} />}

          {m.role === 'editor' && role !== 'admin' && (
            <>
              <SectionTitle>Görevler</SectionTitle>
              <Card style={{ gap: 10 }}>
                <T size={12.5} color={colors.muted}>
                  Düzenleyebileceği bölümler
                </T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {DUTY_PACKAGES.map((d) => {
                    const on = duties.includes(d.key);
                    const half = !on && d.permissions.some((x) => partial.includes(x));
                    return (
                      <Chip
                        key={d.key}
                        label={half ? `${d.label} (kısmen)` : d.label}
                        icon={on ? 'checkmark' : 'add'}
                        selected={on}
                        onPress={
                          editable
                            ? () => {
                                setPerms((x) => toggleDuty(x, d.key, !on));
                                setSaved(false);
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </View>
                {partial.length > 0 && (
                  <T size={12} color={colors.warning}>
                    “Kısmen”: eski seçimden paketin bir bölümü verilmiş. Dokunursanız paketin tamamı verilir.
                  </T>
                )}
                <T size={12.5} weight="800" color={colors.muted} style={{ marginTop: 4 }}>
                  DİĞER YETKİLER
                </T>
                {EXTRA_PERMISSIONS.map((e) => (
                  <ToggleRow
                    key={e.key}
                    label={e.label}
                    description={e.text}
                    value={perms.includes(e.key)}
                    onChange={(on) => {
                      if (!editable) return;
                      setPerms((x) => (on ? [...x, e.key] : x.filter((y) => y !== e.key)));
                      setSaved(false);
                    }}
                  />
                ))}
              </Card>
            </>
          )}

          {m.role === 'admin' && role === 'admin' && (
            // Mesleki eğitim (KVKK): müdür yardımcısının rolü öğrencilerin işletme kayıtlarını kendiliğinden açmaz
            <Card>
              <ToggleRow
                label="Mesleki eğitimi yönetir"
                description="Bütün işletmeleri ve öğrencileri görür, koordinatör öğretmenleri işaretler, koordinatör müdür yardımcısını seçer."
                value={perms.includes('internship.manage')}
                onChange={(on) => {
                  if (!editable) return;
                  setPerms((x) => (on ? [...x, 'internship.manage'] : x.filter((y) => y !== 'internship.manage')));
                  setSaved(false);
                }}
              />
            </Card>
          )}

          {editable && (dirty || saved) && (
            <Button
              loading={busy === 'save'}
              icon={saved ? 'checkmark' : undefined}
              disabled={!dirty}
              onPress={() =>
                void run('save', async () => {
                  await api(`${ctx.membersPath}/${m.id}`, { method: 'PATCH', body: applyPersonRole(role as Exclude<PersonRole, 'owner'>, perms) });
                  setSaved(true);
                })
              }
            >
              {saved && !dirty ? 'Kaydedildi' : 'Kaydet'}
            </Button>
          )}

          {ctx.full && m.role !== 'owner' && !p.roster && (
            <>
              <SectionTitle>Kadro</SectionTitle>
              <Card style={{ gap: 8 }}>
                <TeacherPicker
                  value={m.teacherId}
                  teachers={(teachers.data ?? []).filter((t) => t.isActive !== false)}
                  disabled={busy === 'teacher'}
                  onChange={(t) => void run('teacher', () => api(`${ctx.membersPath}/${m.id}/teacher`, { method: 'PUT', body: { teacherId: t } }))}
                />
                <T size={12.5} color={colors.muted}>
                  Kadro dışı kişi (ör. memur) öğretmen değildir. Öğretmense kadrodaki kaydını seçin: kendi programı ve nöbeti görünür.
                </T>
              </Card>
            </>
          )}

          {editable && (
            <>
              <SectionTitle>Giriş</SectionTitle>
              <Card style={{ gap: 10 }}>
                {m.invitePending && (
                  <Button
                    variant="secondary"
                    icon="send-outline"
                    loading={busy === 'reinvite'}
                    onPress={() =>
                      void run('reinvite', async () => {
                        const res = await api<{ inviteUrl: string; emailed: boolean }>(`${ctx.membersPath}/${m.id}/invite`, { method: 'POST' });
                        setResult({ kind: 'invite', secret: res.inviteUrl, emailed: res.emailed });
                      })
                    }
                  >
                    Daveti yeniden gönder
                  </Button>
                )}
                {!resetting ? (
                  <Button variant="secondary" icon="key-outline" onPress={() => setResetting(true)}>
                    Şifreyi sıfırla
                  </Button>
                ) : (
                  <View style={{ gap: 6 }}>
                    <ToggleRow label="Şifreyi ben belirleyeceğim" description="Kapalıyken okunaklı, güçlü bir şifre üretilir." value={own} onChange={setOwn} />
                    {own && <Field label="Yeni şifre" help="En az 8 karakter" value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="new-password" />}
                    <ToggleRow label="Kişiye e-postayla gönder" description="Sunucuda e-posta ayarlı değilse bilgiler ekranda gösterilir; oradan paylaşabilirsiniz." value={sendEmail} onChange={setSendEmail} />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <Button
                        icon="key-outline"
                        loading={busy === 'reset'}
                        disabled={own && password.length < 8}
                        style={{ flex: 1 }}
                        onPress={() =>
                          void run('reset', async () => {
                            const res = await api<{ password: string; emailed: boolean }>(`${ctx.membersPath}/${m.id}/password`, { body: { sendEmail, ...(own && password ? { password } : {}) } });
                            setResetting(false);
                            setOwn(false);
                            setPassword('');
                            setResult({ kind: 'password', secret: res.password, emailed: res.emailed });
                          })
                        }
                      >
                        Şifreyi sıfırla
                      </Button>
                      <Button variant="secondary" onPress={() => setResetting(false)}>
                        Vazgeç
                      </Button>
                    </View>
                  </View>
                )}
              </Card>
              <Button
                variant="delete"
                icon="trash-outline"
                loading={busy === 'remove'}
                onPress={() =>
                  void confirm({ title: 'Erişim kaldırılsın mı?', subtitle: m.fullName, message: 'Bu kişi artık bu okula giriş yapamaz.', tone: 'warning', icon: 'person-outline', confirmLabel: 'Erişimi kaldır' }).then(
                    (ok) =>
                      ok &&
                      void run('remove', async () => {
                        await api(`${ctx.membersPath}/${m.id}`, { method: 'DELETE' });
                        router.back();
                      }),
                  )
                }
              >
                Okul erişimini kaldır
              </Button>
            </>
          )}
        </>
      )}

      {!m && p.status !== 'pending' && ctx.full && (
        <T size={12.5} color={colors.muted}>
          Rol ve görevler hesap açıldıktan sonra burada verilir. Önerilen rol: {PERSON_ROLES[p.role].label}.
        </T>
      )}
    </>
  );
}

type Run = (tag: string, fn: () => Promise<unknown>) => Promise<void>;

/** Müdür yardımcısı önerisi: yönetici önerir, müdür onaylar */
function Promotion({ p, ctx, busy, run }: { p: Person; ctx: ReturnType<typeof usePeople>; busy: string | null; run: Run }) {
  const { role: myRole } = useAuth();
  const m = p.member!;
  const path = `${ctx.membersPath}/${m.id}/promotion-request`;
  if (myRole === 'owner') {
    return (
      <Card tone="warning" style={{ gap: 10 }}>
        <T size={13.5}>
          {m.promotionRequest!.byName}, {p.fullName} kişisinin Müdür yardımcısı yapılmasını öneriyor.
        </T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => void run('promote-no', () => api(path, { method: 'DELETE' }))}>
            Reddet
          </Button>
          <Button size="sm" icon="checkmark" style={{ flex: 1 }} loading={busy === 'promote'} onPress={() => void run('promote', () => api(`${path}/approve`, { body: {} }))}>
            Onayla
          </Button>
        </View>
      </Card>
    );
  }
  return m.promotionRequest ? (
    <View style={{ gap: 6 }}>
      <T size={12.5} color={colors.warning} weight="700">
        Müdür yardımcısı önerisi müdürün onayını bekliyor.
      </T>
      <Button size="sm" variant="secondary" onPress={() => void run('promote-no', () => api(path, { method: 'DELETE' }))}>
        Öneriyi geri çek
      </Button>
    </View>
  ) : (
    <Button
      size="sm"
      variant="secondary"
      icon="shield-outline"
      loading={busy === 'promote'}
      onPress={() =>
        void confirm({ title: 'Müdüre önerilsin mi?', message: `${p.fullName} kişisinin Müdür yardımcısı yapılması müdürün onayına gönderilir.`, tone: 'neutral', icon: 'shield-outline', confirmLabel: 'Öner' }).then(
          (ok) => ok && void run('promote', () => api(path, { body: {} })),
        )
      }
    >
      Müdür yardımcısı yapılmasını öner
    </Button>
  );
}
