import { router } from 'expo-router';
import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './text.tsx';
import { useAuth } from './auth.tsx';
import { useInbox, useMeToday, useNow, type MeToday } from './data.ts';
import { classLabel, dayBellPeriods, teacherDay } from './day.ts';
import { scheduleDutyReminders } from './push.ts';
import { colors, type TileTone } from './theme.ts';
import { LiveLesson } from './lesson.tsx';
import { Banner, Card, HeaderButton, HomeHeader, Icon, ListRow, Loading, Screen, T, Tile, type IconName } from './ui.tsx';
import { ChipLinks } from './quick.tsx';

/** Sağ üstteki bildirim zili (okunmamış sayısıyla) */
export function NotificationsButton() {
  const notes = useInbox('unread');
  return <HeaderButton icon="notifications-outline" label="Bildirimler" badge={notes.data?.unread ?? 0} onPress={() => router.push('/bildirimler')} />;
}

/** Logo yerine okulun baş harfi (logo görseli yüklenmemişse de aynı görünür) */
export function SchoolBadge({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.onPrimary, fontWeight: '800', fontSize: size * 0.42 }}>{name.trim().charAt(0).toLocaleUpperCase('tr-TR')}</Text>
    </View>
  );
}


/** Bugünkü nöbet kutusu: nöbet varsa turuncu, yoksa beyaz */
export function DutyTile({ data, style }: { data: MeToday; style?: StyleProp<ViewStyle> }) {
  const today = data.week.find((d) => d.date === data.today);
  const duty = today?.duties[0];
  const tone: TileTone = duty && !duty.coveredBy ? 'peach' : 'paper';
  const label = !duty ? 'Nöbet' : duty.coveredBy ? 'Nöbetiniz devredildi' : duty.substituteFor ? 'Bugün görevlisiniz' : 'Bugün nöbetçisiniz';
  const caption = !duty
    ? 'Haftalık nöbet listesi'
    : duty.coveredBy
      ? `İzniniz nedeniyle ${duty.coveredBy} tutuyor`
      : duty.substituteFor
        ? `${duty.substituteFor} yerine`
        : duty.partners.length
          ? `Birlikte: ${duty.partners.join(', ')}`
          : 'Nöbet listesi için dokunun';
  return (
    <Tile tone={tone} icon="shield-checkmark-outline" label={label} caption={caption} headline={duty ? duty.area : 'Bugün yok'} onPress={() => router.push('/nobet')} style={style} />
  );
}


/** Bugünkü nöbet (öğretmen kaydı olan editörün ana sayfasında): tam genişlikte nöbet kutusu */
export function TodayDutyCard({ data }: { data: MeToday }) {
  if (!data.teacher || data.week.find((d) => d.date === data.today)?.holiday) return null;
  return <DutyTile data={data} />;
}

export function IconTile({ name, tone = 'primary', size = 48 }: { name: IconName; tone?: 'primary' | 'warning' | 'muted' | 'danger' | 'gold'; size?: number }) {
  const t = {
    primary: [colors.primarySoft, colors.primary],
    warning: [colors.warningSoft, colors.warning],
    muted: [colors.primarySoft, colors.muted],
    danger: [colors.dangerSoft, colors.danger],
    gold: [colors.goldSoft, colors.gold],
  }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: t[0], alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={size / 2} color={t[1]} />
    </View>
  );
}


/** Nöbet günlerinde ilk dersten 15 dakika önce telefona yerel hatırlatma kurulur */
export function useDutyReminders(data: MeToday | undefined) {
  useEffect(() => {
    if (!data?.teacher) return;
    const items = data.week.flatMap((d) => {
      if (d.holiday || !d.duties.some((x) => !x.coveredBy)) return [];
      const first = dayBellPeriods(data, d.weekday)[0]?.start;
      return first ? [{ date: d.date, time: first, area: d.duties.find((x) => !x.coveredBy)!.area }] : [];
    });
    void scheduleDutyReminders(items).catch(() => undefined);
  }, [data]);
}

/** Öğretmenin ana ekranı: zil kutusu, ders ve nöbet kutuları, hızlı işlemler, günün programı */
export function TeacherHome() {
  const { me, school, can } = useAuth();
  const today = useMeToday();
  const now = useNow(60_000);
  useDutyReminders(today.data);
  const actions: { label: string; icon: IconName; to: string }[] = [
    // Öğretmen görünümünde duyurular yalnızca okunur (yayındakiler); ders programı alt menüde
    { label: 'Duyurular', icon: 'megaphone-outline', to: '/duyurular' },
    { label: 'İzin bildir', icon: 'calendar-outline', to: '/izin' },
  ];
  return (
    <Screen refreshing={today.isRefetching} onRefresh={() => void today.refetch()}>
      <HomeHeader name={me?.user.fullName} school={school?.name} role="Öğretmen">
        <NotificationsButton />
      </HomeHeader>
      {today.isLoading || !today.data ? (
        <Loading />
      ) : (
        <>
          {teacherDay(today.data, now).holiday ? <DayBanner data={today.data} /> : <LiveLesson data={today.data} link />}
          {!today.data.teacher && can('conduct.counsel') ? null : !today.data.teacher ? (
            <Card tone="warning">
              <T weight="700">Hesabınız bir öğretmen kaydına bağlı değil</T>
              <T size={13} color={colors.muted}>
                Kendi nöbetlerinizi ve ders programınızı görmek için okul yöneticiniz panelde Kullanıcılar sayfasından hesabınızı öğretmen kaydınızla eşleştirsin.
              </T>
            </Card>
          ) : !teacherDay(today.data, now).holiday ? (
            <DutyTile data={today.data} />
          ) : null}
          <ChipLinks items={actions} />
        </>
      )}
    </Screen>
  );
}

/** Günün durumu bandı: tam gün tatil ya da arife (yarım gün); normal günde görünmez */
export function DayBanner({ data }: { data: MeToday }) {
  const now = useNow(60_000);
  const day = teacherDay(data, now);
  if (day.holiday) return <Banner icon="sunny" tone="gold" title="Bugün tatil" text={`${day.holiday} · zil çalmıyor, panolar tatil görünümünde`} />;
  if (day.halfDay) return <Banner icon="partly-sunny" tone="warning" title={`Yarım gün · ${day.halfDay}`} text={`Dersler ${day.endsAt} saatinde biter; öğleden sonra tatil`} />;
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
      ? { title: `Şu an: ${classLabel(current.className)} · ${current.subject}`, subtitle: `${current.period.start} – ${current.period.end}` }
      : next
        ? { title: `Sıradaki: ${classLabel(next.className)} · ${next.subject}`, subtitle: `${next.period.start} – ${next.period.end}` }
        : { title: day.lessons.length ? 'Bugünkü dersleriniz bitti' : 'Bugün dersiniz yok', subtitle: 'Haftalık program için dokunun' };
  return (
    <Card style={{ paddingVertical: 4, gap: 0 }}>
      <ListRow icon="time-outline" title={lesson.title} subtitle={lesson.subtitle} onPress={() => router.push('/programim')} />
      <ListRow
        icon="shield-checkmark-outline"
        iconTone={duty && !day.holiday ? 'warning' : 'muted'}
        title={day.holiday ? 'Bugün nöbet yok' : duty ? `Bugün nöbet: ${duty.area}` : 'Bugün nöbetiniz yok'}
        subtitle={duty && !day.holiday ? (duty.partners.length ? `Birlikte: ${duty.partners.join(', ')}` : 'Nöbet listesi için dokunun') : 'Haftanın nöbetleri için dokunun'}
        onPress={() => router.push('/nobet')}
        last
      />
    </Card>
  );
}
