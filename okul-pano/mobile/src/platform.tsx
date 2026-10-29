import { academicYearOf } from '@okulpano/shared/academicCalendar';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from './text.tsx';
import { api } from './api.ts';
import { useAuth } from './auth.tsx';
import { useAcademicCalendars, usePlatformSchools, useSignups } from './data.ts';
import { fullDate, homeTitle, localIso, timeAgo } from './day.ts';
import { colors } from './theme.ts';
import { Badge, BentoRow, Button, Card, Empty, ErrorNote, HomeHeader, ListRow, Loading, Screen, SectionTitle, T, Tile } from './ui.tsx';
import { MenuButton } from './quick.tsx';

/** Kendi okuluna (süper kullanıcı) ya da destek erişimi süren bir okula geçer */
export function useOpenSchool() {
  const { selectSchool, setPlatformMode } = useAuth();
  return async (id: string) => {
    await selectSchool(id);
    await setPlatformMode(false);
    router.replace('/');
  };
}

/** Platform yöneticisinin ana ekranı: okullar, kayıt onayları, destek erişimleri, MEB takvimi */
export function PlatformHome() {
  const { me } = useAuth();
  const schools = usePlatformSchools();
  const signups = useSignups();
  const calendars = useAcademicCalendars();
  const openSchool = useOpenSchool();
  const qc = useQueryClient();
  const approve = useMutation({
    mutationFn: (id: string) => api(`/api/platform/signups/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform'] }),
  });

  const list = schools.data ?? [];
  const now = Date.now();
  const own = list.filter((s) => s.member);
  const support = list.filter((s) => !s.member && s.canOpen);
  const trials = list.filter((s) => s.plan === 'trial' && s.isActive);
  const ending = trials.filter((s) => s.trialEndsAt && Date.parse(s.trialEndsAt) - now < 7 * 86400_000);
  const waiting = (signups.data ?? []).filter((s) => !s.expired);
  const year = academicYearOf(new Date().toISOString().slice(0, 10));
  const nextCal = calendars.data?.find((c) => c.startYear === year + 1);
  const review = calendars.data?.filter((c) => c.status === 'review' || c.pending) ?? [];

  return (
    <Screen refreshing={schools.isRefetching} onRefresh={() => void Promise.all([schools.refetch(), signups.refetch(), calendars.refetch()])}>
      <HomeHeader name={me?.user.fullName} school="Platform" role="Platform yöneticisi" title={homeTitle(localIso())[0]} titleMuted={homeTitle(localIso())[1]}>
        <MenuButton />
      </HomeHeader>
      <ErrorNote error={schools.error} />
      {schools.isLoading ? (
        <Loading />
      ) : (
        <>
          <BentoRow>
            <Tile tone="ink" icon="business-outline" label="Okullar" value={list.filter((s) => s.isActive).length} caption="etkin okul" onPress={() => router.push('/okullar')} style={{ flex: 1.15 }} big>
              {/* Paket dağılımı ve toplam pano: koyu kutunun alt yarısı */}
              <View style={{ marginTop: 16, gap: 9 }}>
                {(
                  [
                    ['Pro', list.filter((s) => s.isActive && s.plan === 'pro').length, '#a78bfa'],
                    ['Temel', list.filter((s) => s.isActive && s.plan === 'basic').length, '#38bdf8'],
                    ['Deneme', trials.length, '#fbbf24'],
                    ['Pano', list.reduce((n, s) => n + s.screenCount, 0), '#4ade80'],
                  ] as const
                ).map(([label, n, dot]) => (
                  <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
                    <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: '#fff' }}>{label}</Text>
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] }}>{n}</Text>
                  </View>
                ))}
              </View>
            </Tile>
            <View style={{ flex: 1, gap: 10 }}>
              <Tile tone="sky" icon="hourglass-outline" label="Deneme" value={trials.length} caption={ending.length ? `${ending.length} tanesi bu hafta bitiyor` : 'okul denemede'} onPress={() => router.push('/okullar')} style={{ flex: 1 }} />
              <Tile tone={waiting.length ? 'peach' : 'paper'} icon="person-add-outline" label="Kayıt" value={waiting.length} caption={waiting.length ? 'onay bekliyor' : 'bekleyen yok'} style={{ flex: 1 }} />
            </View>
          </BentoRow>

          {own.length > 0 && (
            <>
              <SectionTitle>Okulum · süper kullanıcı</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {own.map((s, i) => (
                  <ListRow
                    key={s.id}
                    icon="swap-horizontal-outline"
                    title={s.name}
                    subtitle="Okulumu aç · her şey açık"
                    onPress={() => void openSchool(s.id)}
                    last={i === own.length - 1}
                  />
                ))}
              </Card>
            </>
          )}

          <SectionTitle>Destek erişimi olan okullar</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {support.length ? (
              support.map((s, i) => (
                <ListRow
                  key={s.id}
                  icon="key-outline"
                  title={s.name}
                  subtitle={`Müdür onayıyla · ${fullDate(s.supportAccessUntil!)} tarihine kadar`}
                  onPress={() => void openSchool(s.id)}
                  last={i === support.length - 1}
                />
              ))
            ) : (
              <Empty
                icon="lock-closed-outline"
                title="Açık destek erişimi yok"
                text="Bir okulun verilerine yalnızca müdürün verdiği süreli erişimle girebilirsiniz."
              />
            )}
          </Card>

          {waiting.length > 0 && (
            <>
              <SectionTitle>Kayıt onayları</SectionTitle>
              {waiting.map((s) => (
                <Card key={s.id} style={{ gap: 6 }}>
                  <T weight="700">{s.schoolName}</T>
                  <T size={13} color={colors.muted}>
                    {s.ownerName} · {s.email}
                    {s.city ? ` · ${s.city}` : ''} · {timeAgo(s.createdAt)}
                  </T>
                  <T size={12} color={colors.muted}>
                    E-postasını doğrulamadı. Elle onaylarsanız okul açılır, başvuran kendi şifresiyle girer.
                  </T>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="checkmark"
                    loading={approve.isPending && approve.variables === s.id}
                    onPress={() => approve.mutate(s.id)}
                  >
                    Onayla ve okulu aç
                  </Button>
                </Card>
              ))}
              <ErrorNote error={approve.error} />
            </>
          )}

          {ending.length > 0 && (
            <>
              <SectionTitle>Denemesi bitmek üzere</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {ending.map((s, i) => (
                  <ListRow
                    key={s.id}
                    icon="time-outline"
                    iconTone="warning"
                    title={s.name}
                    subtitle={`Deneme ${fullDate(s.trialEndsAt!)} tarihinde bitiyor`}
                    onPress={() => router.push('/okullar')}
                    last={i === ending.length - 1}
                  />
                ))}
              </Card>
            </>
          )}

          <SectionTitle>MEB çalışma takvimi</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            <ListRow
              icon="calendar-outline"
              iconTone={review.length ? 'warning' : nextCal ? 'primary' : 'muted'}
              title={
                review.length
                  ? `${review.length} takvim onay bekliyor`
                  : nextCal
                    ? `${nextCal.label} takvimi sistemde`
                    : `${year + 1}-${year + 2} takvimi henüz yok`
              }
              subtitle={
                review.length
                  ? 'Taranan tarihleri kontrol edip onaylayın'
                  : nextCal
                    ? 'Tatiller okullara işlendi'
                    : 'Haziran ortasından itibaren her gün taranır'
              }
              onPress={() => router.push('/takvim')}
              last
              right={review.length ? <Badge tone="warning">Onay</Badge> : undefined}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR'))
    .join('');
