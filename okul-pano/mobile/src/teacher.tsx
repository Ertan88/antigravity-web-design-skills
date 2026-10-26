import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from './auth.tsx';
import { useMeToday, useNotifications, useNow, type MeToday } from './data.ts';
import { bellHeadline, countdownText, greeting, teacherDay } from './day.ts';
import { scheduleDutyReminders } from './push.ts';
import { colors, radius } from './theme.ts';
import { Card, Empty, Icon, Label, Loading, Screen, SectionTitle, T, type IconName } from './ui.tsx';

/** Sağ üstteki bildirim zili (okunmamış sayısıyla) */
export function NotificationsButton() {
  const notes = useNotifications();
  const n = notes.data?.length ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={n ? `Bildirimler, ${n} yeni` : 'Bildirimler'}
      onPress={() => router.push('/bildirimler')}
      style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#dbe3e8', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name="notifications-outline" size={22} />
      {n > 0 && (
        <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{n > 9 ? '9+' : n}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Logo yerine okulun baş harfi (logo görseli yüklenmemişse de aynı görünür) */
export function SchoolBadge({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>{name.trim().charAt(0).toLocaleUpperCase('tr-TR')}</Text>
    </View>
  );
}

/** Şu anki ders / teneffüs ve geri sayım (panodaki zil kartının cepteki hali) */
export function BellHero({ data }: { data: MeToday }) {
  const now = useNow(1000);
  const day = teacherDay(data, now);
  const h = bellHeadline(day.bell);
  const next = day.lessons.find((l) => l.state === 'next');
  return (
    <Card tone="primary" style={{ gap: 12, borderRadius: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: '#fff', opacity: 0.92, fontSize: 13, fontWeight: '700' }}>{day.holiday ? `Tatil · ${day.holiday}` : h.title}</Text>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][day.now.weekday]}</Text>
        </View>
      </View>
      {h.remaining != null && !day.holiday ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{countdownText(h.remaining)}</Text>
          <Text style={{ color: '#fff', opacity: 0.9, fontSize: 14 }}>{h.caption}</Text>
        </View>
      ) : (
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{day.holiday ? 'İyi tatiller' : h.caption}</Text>
      )}
      {h.progress != null && !day.holiday && (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' }} accessibilityRole="progressbar">
          <View style={{ width: `${Math.min(100, h.progress * 100)}%`, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
        </View>
      )}
      {!day.holiday && (next || h.next) && (
        <Text style={{ color: '#fff', opacity: 0.95, fontSize: 13 }}>
          {next ? `Sıradaki dersiniz: ${next.period.start} · ${next.className} ${next.subject}` : h.next}
        </Text>
      )}
    </Card>
  );
}

/** Bugünkü nöbet: yer, birlikte nöbet tutanlar; nöbetini başkası tutuyorsa o bilgi */
export function TodayDutyCard({ data }: { data: MeToday }) {
  const today = data.week.find((d) => d.date === data.today);
  const duty = today?.duties[0];
  if (!data.teacher) return null;
  if (today?.holiday) return null;
  if (!duty) {
    return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconTile name="shield-checkmark-outline" tone="muted" />
        <T color={colors.muted}>Bugün nöbetiniz yok</T>
      </Card>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/nobet')}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconTile name="shield-checkmark-outline" tone="warning" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label color={colors.warning}>{duty.coveredBy ? 'Nöbetiniz devredildi' : duty.substituteFor ? 'Bugün görevlisiniz' : 'Bugün nöbetçisiniz'}</Label>
          <T size={16} weight="700">
            {duty.area}
          </T>
          <T size={13} color={colors.muted}>
            {duty.coveredBy
              ? `İzniniz nedeniyle ${duty.coveredBy} tutuyor`
              : duty.substituteFor
                ? `${duty.substituteFor} yerine · teneffüslerde`
                : duty.partners.length
                  ? `Birlikte: ${duty.partners.join(', ')}`
                  : 'Teneffüslerde'}
          </T>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.faint} />
      </Card>
    </Pressable>
  );
}

export function IconTile({ name, tone = 'primary', size = 48 }: { name: IconName; tone?: 'primary' | 'warning' | 'muted' | 'danger' | 'gold'; size?: number }) {
  const t = {
    primary: [colors.primarySoft, colors.primary],
    warning: [colors.warningSoft, colors.warning],
    muted: ['#eef2f5', colors.muted],
    danger: [colors.dangerSoft, colors.danger],
    gold: [colors.goldSoft, colors.gold],
  }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: 14, backgroundColor: t[0], alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={size / 2} color={t[1]} />
    </View>
  );
}

/** Bugünkü ders programı: geçenler soluk, şu anki vurgulu */
export function MySchedule({ data }: { data: MeToday }) {
  const now = useNow(30_000);
  const day = teacherDay(data, now);
  if (!data.teacher) return null;
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>Bugünkü programım</SectionTitle>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {day.holiday ? (
          <Empty icon="sunny-outline" title="Bugün tatil" text={day.holiday} />
        ) : day.lessons.length ? (
          day.lessons.map((l, i) => (
            <View
              key={l.period.no}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: '#eef2f5',
                backgroundColor: l.state === 'now' ? colors.primarySoft : '#fff',
                opacity: l.state === 'past' ? 0.55 : 1,
              }}
            >
              <Text style={{ width: 52, fontSize: 13, color: l.state === 'now' ? colors.primary : colors.muted, fontWeight: l.state === 'now' ? '700' : '400', fontVariant: ['tabular-nums'] }}>
                {l.period.start}
              </Text>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: l.state === 'now' ? '700' : '600', color: colors.ink }}>
                {l.className} · {l.subject}
              </Text>
              {l.state === 'now' && <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>ŞİMDİ</Text>}
              {l.state === 'next' && <Text style={{ fontSize: 11, fontWeight: '800', color: colors.muted }}>SIRADAKİ</Text>}
            </View>
          ))
        ) : (
          <Empty icon="cafe-outline" title="Bugün dersiniz yok" />
        )}
      </Card>
    </View>
  );
}

/** Nöbet günlerinde ilk dersten 15 dakika önce telefona yerel hatırlatma kurulur */
export function useDutyReminders(data: MeToday | undefined) {
  useEffect(() => {
    if (!data?.teacher) return;
    const items = data.week.flatMap((d) => {
      if (d.holiday || !d.duties.some((x) => !x.coveredBy)) return [];
      const schedule = data.bellSchedules.filter((s) => s.weekdays.includes(d.weekday)).sort((a, b) => a.weekdays.length - b.weekdays.length)[0];
      const first = schedule?.periods.map((p) => p.start).sort()[0];
      return first ? [{ date: d.date, time: first, area: d.duties.find((x) => !x.coveredBy)!.area }] : [];
    });
    void scheduleDutyReminders(items).catch(() => undefined);
  }, [data]);
}

/** Öğretmenin ana ekranı (tasarım 1) */
export function TeacherHome() {
  const { me, school } = useAuth();
  const today = useMeToday();
  const now = useNow(60_000);
  useDutyReminders(today.data);
  const firstName = me?.user.fullName.split(' ')[0] ?? '';
  const actions: { label: string; icon: IconName; to: string }[] = [
    { label: 'Duyuru', icon: 'megaphone-outline', to: '/duyuru-yeni' },
    { label: 'İzin', icon: 'calendar-outline', to: '/izin' },
    { label: 'Nöbet', icon: 'shield-checkmark-outline', to: '/nobet' },
    { label: 'Panolar', icon: 'tv-outline', to: '/panolar' },
  ];
  return (
    <Screen refreshing={today.isRefetching} onRefresh={() => void today.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 }}>
        <SchoolBadge name={school?.name ?? 'O'} />
        <View style={{ flex: 1 }}>
          <T size={13} color={colors.muted}>
            {greeting(now.getHours())},
          </T>
          <T size={18} weight="700">
            {firstName} {today.data?.teacher ? 'Öğretmen' : ''}
          </T>
        </View>
        <NotificationsButton />
      </View>
      {today.isLoading || !today.data ? (
        <Loading />
      ) : (
        <>
          <BellHero data={today.data} />
          {!today.data.teacher && (
            <Card tone="warning">
              <T weight="700">Hesabınız bir öğretmen kaydına bağlı değil</T>
              <T size={13} color={colors.muted}>
                Kendi nöbetlerinizi ve ders programınızı görmek için okul yöneticiniz panelde Kullanıcılar sayfasından hesabınızı öğretmen kaydınızla eşleştirsin.
              </T>
            </Card>
          )}
          <TodayDutyCard data={today.data} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {actions.map((a) => (
              <Pressable
                key={a.to}
                accessibilityRole="button"
                onPress={() => router.push(a.to as never)}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 84,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Icon name={a.icon} size={22} color={colors.primary} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
          <MySchedule data={today.data} />
        </>
      )}
    </Screen>
  );
}

