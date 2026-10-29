import { router } from 'expo-router';
import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './text.tsx';
import { useAuth } from './auth.tsx';
import { useInbox, useMeToday, useNow, type MeToday } from './data.ts';
import { bellHeadline, countdownText, dayTitle, greeting, teacherDay } from './day.ts';
import { scheduleDutyReminders } from './push.ts';
import { colors, radius, tiles, type TileTone } from './theme.ts';
import { Badge, Banner, BentoRow, Card, Empty, HeaderButton, HomeHeader, Icon, ListRow, Loading, Screen, SectionTitle, T, Tile, type IconName } from './ui.tsx';
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

/** Şu anki ders / teneffüs ve geri sayım (panodaki zil kartının cepteki hali): koyu bento kutusu; tatilde güneş bandı */
export function BellHero({ data }: { data: MeToday }) {
  const now = useNow(1000);
  const day = teacherDay(data, now);
  const h = bellHeadline(day.bell);
  const next = day.lessons.find((l) => l.state === 'next');
  const t = tiles.ink;
  if (day.holiday) return <DayBanner data={data} />;
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: radius.xl, padding: 18, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <Icon name="notifications-outline" size={16} color={t.sub} />
          <Text style={{ color: t.sub, fontSize: 13, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
            {h.title}
          </Text>
        </View>
        <View style={{ backgroundColor: t.chip, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 5 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{dayTitle(data.today, { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
        </View>
      </View>
      {h.remaining != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <Text style={{ color: '#fff', fontSize: 52, lineHeight: 56, fontWeight: '800', letterSpacing: -2, fontVariant: ['tabular-nums'] }}>{countdownText(h.remaining)}</Text>
          <Text style={{ color: t.sub, fontSize: 14, fontWeight: '600' }}>{h.caption}</Text>
        </View>
      ) : (
        <Text style={{ color: '#fff', fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6 }}>{h.caption}</Text>
      )}
      {h.progress != null && (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)' }} accessibilityRole="progressbar">
          <View style={{ width: `${Math.min(100, h.progress * 100)}%`, height: 6, borderRadius: 3, backgroundColor: '#fde68a' }} />
        </View>
      )}
      {day.halfDay && (
        <Text style={{ color: '#fde68a', fontSize: 13, fontWeight: '700' }}>
          {day.halfDay} · yarım gün, son zil {day.endsAt}
        </Text>
      )}
      {(next || h.next) && (
        <Text style={{ color: t.sub, fontSize: 13, fontWeight: '600' }}>
          {next ? `Sıradaki dersiniz ${next.period.start} · ${next.className} ${next.subject}` : h.next}
        </Text>
      )}
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
          : 'Teneffüslerde';
  return (
    <Tile tone={tone} icon="shield-checkmark-outline" label={label} caption={caption} headline={duty ? duty.area : 'Bugün yok'} onPress={() => router.push('/nobet')} style={style} />
  );
}

/** Sıradaki (ya da şu anki) ders kutusu */
export function LessonTile({ data, style }: { data: MeToday; style?: StyleProp<ViewStyle> }) {
  const now = useNow(30_000);
  const day = teacherDay(data, now);
  const current = day.lessons.find((l) => l.state === 'now');
  const next = day.lessons.find((l) => l.state === 'next');
  const l = current ?? next;
  return (
    <Tile
      tone={l ? 'sky' : 'paper'}
      icon="time-outline"
      label={current ? 'Şu anki ders' : next ? 'Sıradaki ders' : 'Ders'}
      caption={l ? `${l.subject} · ${l.period.start}` : 'Haftalık program'}
      onPress={() => router.push('/programim')}
      headline={l ? l.className : day.lessons.length ? 'Bitti' : 'Ders yok'}
      style={style}
    />
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
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: colors.divider,
                backgroundColor: l.state === 'now' ? tiles.sky.bg : colors.card,
                opacity: l.state === 'past' ? 0.55 : 1,
              }}
            >
              <Text style={{ width: 52, fontSize: 13, color: l.state === 'now' ? tiles.sky.fg : colors.faint, fontWeight: l.state === 'now' ? '800' : '600', fontVariant: ['tabular-nums'] }}>
                {l.period.start}
              </Text>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: l.state === 'now' ? '700' : '600', color: colors.ink }}>
                {l.className} · {l.subject}
              </Text>
              {l.state === 'now' && <Badge tone="primary">Şimdi</Badge>}
              {l.state === 'next' && <Badge>Sıradaki</Badge>}
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

/** Öğretmenin ana ekranı: zil kutusu, ders ve nöbet kutuları, hızlı işlemler, günün programı */
export function TeacherHome() {
  const { me, school } = useAuth();
  const today = useMeToday();
  const now = useNow(60_000);
  useDutyReminders(today.data);
  const firstName = me?.user.fullName.split(' ')[0] ?? '';
  const actions: { label: string; icon: IconName; to: string }[] = [
    { label: 'Duyuru', icon: 'megaphone-outline', to: '/duyuru-yeni' },
    { label: 'İzin iste', icon: 'calendar-outline', to: '/izin' },
    { label: 'Panolar', icon: 'tv-outline', to: '/panolar' },
    { label: 'Program', icon: 'time-outline', to: '/programim' },
  ];
  return (
    <Screen refreshing={today.isRefetching} onRefresh={() => void today.refetch()}>
      <HomeHeader name={me?.user.fullName} school={school?.name} role="Öğretmen" title={`${greeting(now.getHours())},`} titleMuted={firstName}>
        <NotificationsButton />
      </HomeHeader>
      {today.isLoading || !today.data ? (
        <Loading />
      ) : (
        <>
          <BellHero data={today.data} />
          {!today.data.teacher ? (
            <Card tone="warning">
              <T weight="700">Hesabınız bir öğretmen kaydına bağlı değil</T>
              <T size={13} color={colors.muted}>
                Kendi nöbetlerinizi ve ders programınızı görmek için okul yöneticiniz panelde Kullanıcılar sayfasından hesabınızı öğretmen kaydınızla eşleştirsin.
              </T>
            </Card>
          ) : !teacherDay(today.data, now).holiday ? (
            <BentoRow>
              <LessonTile data={today.data} style={{ flex: 1 }} />
              <DutyTile data={today.data} style={{ flex: 1 }} />
            </BentoRow>
          ) : null}
          <ChipLinks items={actions} />
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
