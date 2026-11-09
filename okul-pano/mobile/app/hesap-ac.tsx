import { ENROLL_ROLES, type EnrollRole, errorText } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { Sheet } from '../src/sheet.tsx';
import { Text } from '../src/text.tsx';
import { colors, tiles, TILE_KEYS, type TileTone } from '../src/theme.ts';
import { Button, Card, Chip, Empty, ErrorNote, Field, Icon, Loading, Screen, T, initials } from '../src/ui.tsx';

interface Row {
  teacherId: string;
  fullName: string;
  title: string | null;
  branch: string | null;
  status: 'account' | 'invited' | 'pending' | 'code' | 'none';
  role: EnrollRole;
  email: string | null;
  enrollmentId: string | null;
}
interface Roster {
  mail: boolean;
  full: boolean;
  owner: boolean;
  rows: Row[];
}

const TONES = TILE_KEYS.filter((k) => k !== 'ink' && k !== 'paper') as TileTone[];
const toneOf = (name: string) => TONES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % TONES.length]!;

/**
 * Öğretmen hesabı aç (okul müdürü, yöneticiler ve "Öğretmen hesabı açma" yetkisi olanlar). Üstte onay bekleyenler,
 * altta hesabı olmayanlar: "Kod" ile tek kullanımlık giriş kodu gösterilir. Dar yetkiyle yalnızca Öğretmen rolü açılır.
 */
export default function HesapAc() {
  const { can, school } = useAuth();
  const allowed = can('users.manage') || can('accounts.enroll');
  const path = useSchoolPath('enrollments');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [school?.id, 'roster'], queryFn: () => api<Roster>(`${path}/roster`), enabled: Boolean(school) && allowed, refetchInterval: 15_000 });
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Row | null>(null);
  const [role, setRole] = useState<EnrollRole>('teacher');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (tag: string, fn: () => Promise<void>) => {
    setBusy(tag);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err, 'İşlem yapılamadı'));
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: [school?.id, 'roster'] });
    }
  };

  const rows = q.data?.rows ?? [];
  const pending = rows.filter((r) => r.status === 'pending');
  const open = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('tr-TR');
    return rows.filter((r) => (r.status === 'none' || r.status === 'code') && (!needle || r.fullName.toLocaleLowerCase('tr-TR').includes(needle)));
  }, [rows, search]);
  const full = Boolean(q.data?.full);

  const showCode = (r: Row, chosen: EnrollRole) =>
    run(`code-${r.teacherId}`, async () => {
      const res = await api<{ code: string; url: string; expiresAt: string }>(`${path}/code`, { body: { teacherId: r.teacherId, role: chosen } });
      setPicked(null);
      router.push({ pathname: '/giris-kodu', params: { code: res.code, url: res.url, until: res.expiresAt, name: r.fullName, role: ENROLL_ROLES[chosen] } });
    });
  const invite = (r: Row, chosen: EnrollRole) =>
    run(`invite-${r.teacherId}`, async () => {
      await api(`${path}/invite`, { body: { teacherId: r.teacherId, role: chosen } });
      setPicked(null);
    });
  const meeting = () =>
    run('meeting', async () => {
      const res = await api<{ url: string; expiresAt: string }>(`${path}/meeting`, { body: {} });
      router.push({ pathname: '/giris-kodu', params: { url: res.url, until: res.expiresAt } });
    });

  if (!allowed) {
    return (
      <Screen back title="Öğretmen hesabı aç">
        <Empty icon="lock-closed-outline" title="Bu ekran için yetkiniz yok" text="Okul müdüründen “Öğretmen hesabı açma” yetkisini isteyin." />
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="Öğretmen hesabı aç"
      subtitle={q.data ? `${open.length} öğretmenin hesabı yok` : undefined}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      footer={
        <Button icon="qr-code-outline" loading={busy === 'meeting'} onPress={() => void meeting()}>
          Toplantı QR'ı göster
        </Button>
      }
    >
      <ErrorNote error={q.error} />
      {error && (
        <T color={colors.danger} weight="600" size={13.5}>
          {error}
        </T>
      )}
      {q.isLoading ? (
        <Loading />
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.warningSoft, borderRadius: 18, padding: 12 }}>
                <Icon name="time-outline" size={22} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink }}>{pending.length} öğretmen onay bekliyor</Text>
                  <T size={12.5} color={colors.muted}>
                    Toplantı QR'ı ile hesap açtı; adı ve e-postayı kontrol edin
                  </T>
                </View>
              </View>
              {pending.map((r) => (
                <Card key={r.teacherId} style={{ gap: 10 }}>
                  <Person row={r} sub={r.email ?? ''} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button size="sm" variant="secondary" style={{ flex: 1 }} loading={busy === `reject-${r.teacherId}`} onPress={() => void run(`reject-${r.teacherId}`, () => api(`${path}/${r.enrollmentId}/cancel`, { body: {} }).then(() => undefined))}>
                      Reddet
                    </Button>
                    <Button
                      size="sm"
                      icon="checkmark"
                      style={{ flex: 2 }}
                      loading={busy === `approve-${r.teacherId}`}
                      onPress={() => void run(`approve-${r.teacherId}`, () => api(`${path}/${r.enrollmentId}/approve`, { body: full ? { role: r.role } : {} }).then(() => undefined))}
                    >
                      {`${full ? ENROLL_ROLES[r.role] : 'Öğretmen'} olarak onayla`}
                    </Button>
                  </View>
                </Card>
              ))}
            </>
          )}

          <Field label="Öğretmen ara" value={search} onChangeText={setSearch} placeholder="ör. Ayşe" />
          {open.length ? (
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {open.map((r, i) => (
                <Pressable
                  key={r.teacherId}
                  accessibilityRole="button"
                  onPress={() => {
                    setRole(full ? r.role : 'teacher');
                    setPicked(r);
                  }}
                  style={({ pressed }) => ({ paddingVertical: 10, borderBottomWidth: i === open.length - 1 ? 0 : 1, borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Person row={r} sub={r.status === 'code' ? 'Kod verildi · süresi dolmadı' : [r.title, r.branch].filter(Boolean).join(' · ') || ' '} />
                    </View>
                    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink }}>Kod</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </Card>
          ) : (
            <Empty icon="checkmark-circle-outline" title={search ? 'Eşleşen öğretmen yok' : 'Kadrodaki herkesin hesabı var'} />
          )}
        </>
      )}

      <Sheet open={Boolean(picked)} onClose={() => setPicked(null)}>
        {picked && (
          <View style={{ gap: 14 }}>
            <View>
              <Text style={{ fontSize: 19, fontWeight: '800', color: colors.ink }}>{picked.fullName}</Text>
              <T size={13} color={colors.muted}>
                {[picked.title, picked.branch].filter(Boolean).join(' · ') || 'Hesabı yok'}
              </T>
            </View>
            {full && (
              <>
                <T size={12} weight="800" color={colors.muted}>
                  ROL
                </T>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {(Object.keys(ENROLL_ROLES) as EnrollRole[])
                    .filter((k) => k !== 'admin' || q.data?.owner)
                    .map((k) => (
                      <Chip key={k} label={ENROLL_ROLES[k]} selected={role === k} onPress={() => setRole(k)} />
                    ))}
                </View>
              </>
            )}
            {error && (
              <T color={colors.danger} weight="600" size={13.5}>
                {error}
              </T>
            )}
            <Button icon="key-outline" loading={busy === `code-${picked.teacherId}`} onPress={() => void showCode(picked, role)}>
              Giriş kodu göster
            </Button>
            {picked.email && q.data?.mail ? (
              <Button variant="secondary" icon="mail-outline" loading={busy === `invite-${picked.teacherId}`} onPress={() => void invite(picked, role)}>
                {`Davet gönder (${picked.email})`}
              </Button>
            ) : null}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

function Person({ row, sub }: { row: Row; sub: string }) {
  const t = tiles[toneOf(row.fullName)];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: t.fg }}>{initials(row.fullName)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
          {row.fullName}
        </Text>
        <Text style={{ fontSize: 12.5, color: colors.muted }} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </View>
  );
}
