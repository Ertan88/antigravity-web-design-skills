import { academicYearOf } from '@okulpano/shared/academicCalendar';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { api } from './api.ts';
import { useAuth } from './auth.tsx';
import { useAcademicCalendars, usePlatformSchools, useSignups } from './data.ts';
import { fullDate, timeAgo } from './day.ts';
import { colors } from './theme.ts';
import { Badge, Button, Card, Empty, ErrorNote, HomeHeader, ListRow, Loading, Screen, SectionTitle, T } from './ui.tsx';
import { MenuButton } from './quick.tsx';

function Kpi({ value, label, to }: { value: string | number; label: string; to?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!to}
      onPress={() => to && router.push(to as never)}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        padding: 12,
        gap: 2,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
    </Pressable>
  );
}

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
      <HomeHeader eyebrow="Platform yöneticisi" title="Platform" subtitle={me?.user.fullName}>
        <MenuButton />
      </HomeHeader>
      <ErrorNote error={schools.error} />
      {schools.isLoading ? (
        <Loading />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Kpi value={list.filter((s) => s.isActive).length} label="etkin okul" to="/okullar" />
            <Kpi value={trials.length} label="denemede" to="/okullar" />
            <Kpi value={waiting.length} label="kayıt bekliyor" />
          </View>

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
