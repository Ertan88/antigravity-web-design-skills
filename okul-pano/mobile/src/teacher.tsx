import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from './auth.tsx';
import { useInbox, useMeToday, useNow, type MeToday } from './data.ts';
import { bellHeadline, countdownText, fullDate, greeting, localIso, teacherDay } from './day.ts';
import { scheduleDutyReminders } from './push.ts';
import { colors, radius } from './theme.ts';
import { Banner, Card, Empty, HeaderButton, HomeHeader, Icon, Label, ListRow, Loading, Screen, SectionTitle, T, type IconName } from './ui.tsx';

/** Sağ üstteki bildirim zili (okunmamış sayısıyla) */
export function NotificationsButton() {
  const notes = useInbox('unread');
  return <HeaderButton icon="notifications-outline" label="Bildirimler" badge={notes.data?.unread ?? 0} onPress={() => router.push('/bildirimler')} />;
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
      {day.halfDay && (
        <Text style={{ color: '#fff', opacity: 0.95, fontSize: 13, fontWeight: '700' }}>
          {day.halfDay} · yarım gün, son zil {day.endsAt}
        </Text>
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
  if (!data.teacher || day.holiday) return null;
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
      <HomeHeader eyebrow="Öğretmen" title={`${greeting(now.getHours())}, ${firstName}`} subtitle={[fullDate(localIso(now)), school?.name].filter(Boolean).join(' · ')}>
        <NotificationsButton />
      </HomeHeader>
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
                  backgroundColor: pressed ? colors.primarySoft : '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  shadowColor: '#0f172a',
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 1,
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


/** Günün durumu bandı: tam gün tatil ya da arife (yarım gün); normal günde görünmez */
export function DayBanner({ data }: { data: MeToday }) {
  const now = useNow(60_000);
  const day = teacherDay(data, now);
  if (day.holiday) return <Banner icon="sunny-outline" tone="gold" title="Bugün tatil" text={`${day.holiday} · zil çalmıyor, panolar tatil görünümünde`} />;
  if (day.halfDay) return <Banner icon="partly-sunny-outline" tone="warning" title={`Yarım gün · ${day.halfDay}`} text={`Dersler ${day.endsAt} saatinde biter; öğleden sonra tatil`} />;
  return null;
}

/** Öğretmen kaydı olan yöneticinin günü: sıradaki ders ve bugünkü nöbet (tatilde kısa bilgi) */
export function MyDayCard({ data }: { data: MeToday }) {
  const now = useNow(60_000);
  const day = teacherDay(data, now);
  if (!data.teacher) return null;
  const current = day.lessons.find((l) => l.state === 'now');
  const next = day.lessons.find((l) => l.state === 'next');
  const duty = data.week.find((d) => d.date === data.today)?.duties.find((d) => !d.coveredBy);
  const lesson = day.holiday
    ? { title: 'Bugün ders yok', subtitle: day.holiday }
    : current
      ? { title: `Şu an: ${current.className} · ${current.subject}`, subtitle: `${current.period.start} – ${current.period.end}` }
      : next
        ? { title: `Sıradaki: ${next.className} · ${next.subject}`, subtitle: `${next.period.start} – ${next.period.end}` }
        : { title: day.lessons.length ? 'Bugünkü dersleriniz bitti' : 'Bugün dersiniz yok', subtitle: 'Haftalık program için dokunun' };
  return (
    <Card style={{ paddingVertical: 4, gap: 0 }}>
      <ListRow icon="time-outline" title={lesson.title} subtitle={lesson.subtitle} onPress={() => router.push('/programim')} />
      <ListRow
        icon="shield-checkmark-outline"
        iconTone={duty && !day.holiday ? 'warning' : 'muted'}
        title={day.holiday ? 'Bugün nöbet yok' : duty ? `Bugün nöbet: ${duty.area}` : 'Bugün nöbetiniz yok'}
        subtitle={duty && !day.holiday ? (duty.partners.length ? `Birlikte: ${duty.partners.join(', ')}` : 'Teneffüslerde') : 'Haftanın nöbetleri için dokunun'}
        onPress={() => router.push('/nobet')}
        last
      />
    </Card>
  );
}
