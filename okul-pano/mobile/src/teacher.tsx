import { router } from 'expo-router';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './text.tsx';
import { membershipLabel, useAuth } from './auth.tsx';
import { useEvents, useExamSchedule, useExams, useInbox, useMeToday, useNow, useUpcomingHolidays, type MeToday } from './data.ts';
import { relativeDayWord } from '@okulpano/shared/coverText';
import { examRoles } from '@okulpano/shared/examCore';
import { zonedParts } from '@okulpano/shared/time';
import { classDayPeriods, classLabel, clock, dative, dayTitle, localIso, schoolDayEnded, teacherDay } from './day.ts';
import { colors, tiles, type TileTone } from './theme.ts';
import { CoverTag, LiveLesson } from './lesson.tsx';
import { Banner, Card, HeaderButton, HomeHeader, Icon, ListRow, Loading, Screen, SectionTitle, T, Tile, type IconName } from './ui.tsx';
import { WebAppStrips } from './webStrips.tsx';

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



/** Öğretmenin ana ekranı: şu an kartı, nöbet, ders sırasında gözlem kısayolu, hızlı işlemler, yaklaşanlar */
export function TeacherHome() {
  const { me, school, can } = useAuth();
  const today = useMeToday();
  const now = useNow(60_000);
  const day = today.data ? teacherDay(today.data, now) : null;
  const linked = Boolean(today.data?.teacher);
  // Kadroda olmayan kişide (ör. memur) gözlem ve izin bildirme yok; rehber öğretmen gözlemi yine görür
  const quick: { label: string; icon: IconName; tone: TileTone; to: string }[] = [
    ...(linked || can('conduct.counsel') ? [{ label: 'Gözlem', icon: 'clipboard-text' as IconName, tone: 'mint' as TileTone, to: '/gozlem' }] : []),
    ...(linked ? [{ label: 'İzin bildir', icon: 'calendar-plus' as IconName, tone: 'peach' as TileTone, to: '/izin' }] : []),
    // Duyurular: yetkisi olan yönetir, olmayan yayındakileri görür
    { label: 'Duyurular', icon: 'megaphone-outline', tone: 'sky', to: '/duyurular' },
    ...(linked ? [{ label: 'Hatırlatma', icon: 'alarm' as IconName, tone: 'sun' as TileTone, to: '/hatirlatmalar' }] : []),
  ];
  return (
    <Screen refreshing={today.isRefetching} onRefresh={() => void today.refetch()}>
      <HomeHeader name={me?.user.fullName} school={school?.name} schoolType={school?.schoolType} role={school ? membershipLabel(school) : 'Öğretmen'}>
        <NotificationsButton />
      </HomeHeader>
      <WebAppStrips />
      {today.isLoading || !today.data || !day ? (
        <Loading />
      ) : (
        <>
          {day.holiday ? <DayBanner data={today.data} /> : <LiveLesson data={today.data} link />}
          <AssignmentNotice data={today.data} />
          {!linked && can('conduct.counsel') ? null : !linked ? (
            <Card tone="warning">
              <T weight="700">Hesabınız bir öğretmen kaydına bağlı değil</T>
              <T size={13} color={colors.muted}>
                Öğretmenseniz, kendi nöbetlerinizi ve ders programınızı görmek için okul yöneticiniz Kişiler ve Yetkiler sayfasında hesabınızı öğretmen kaydınızla eşleştirsin.
              </T>
            </Card>
          ) : !day.holiday ? (
            <DutyTile data={today.data} />
          ) : null}
          {!day.holiday && <ExamTodayCard teacherId={today.data.teacher?.id ?? null} />}
          {!day.holiday && <ObserveCard className={day.lessons.find((l) => l.state === 'now')?.className} />}
          <SectionTitle>Hızlı işlemler</SectionTitle>
          <QuickGrid items={quick} />
          <UpcomingCard />
        </>
      )}
    </Screen>
  );
}

/** Sınav günü: öğretmenin gözetmen olduğu ya da dersinin bugünkü sınavları (bitmemiş olanlar) */
function ExamTodayCard({ teacherId }: { teacherId: string | null }) {
  const q = useExamSchedule();
  const now = useNow(30_000);
  if (!teacherId || !q.data) return null;
  const clockNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const mine = q.data.exams.filter((e) => {
    const r = examRoles(e, teacherId);
    return e.date === q.data.today && (r.proctor || r.subject) && !(e.end && e.end <= clockNow);
  });
  if (!mine.length) return null;
  const first = mine[0]!;
  const r = examRoles(first, teacherId);
  const role = r.proctor ? 'gözetmen sizsiniz' : 'dersinizin sınavı';
  const t = tiles.sun;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/sinav-takvimi')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 22, backgroundColor: t.bg, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="clipboard-check" size={21} color={t.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: t.fg }}>{mine.length === 1 ? 'Bugün sınavınız var' : `Bugün ${mine.length} sınavınız var`}</Text>
        <Text style={{ fontSize: 12.5, color: t.sub, marginTop: 1 }} numberOfLines={2}>
          {first.classLabel || first.className} {first.subject} · {first.periodNo}. ders{first.start ? ` · ${first.start}` : ''} · {role}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color={t.fg} />
    </Pressable>
  );
}

/** Ders sürerken: o sınıfa tek dokunuşla gözlem (Gözlem sekmesi şu anki dersin sınıfıyla açılır) */
function ObserveCard({ className }: { className?: string }) {
  if (!className) return null;
  const name = classLabel(className);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dative(name)} gözlem ekle`}
      onPress={() => router.push('/gozlem')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        paddingHorizontal: 14,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: tiles.mint.bg,
        backgroundColor: colors.successSoft,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: tiles.mint.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="clipboard-text" size={21} color={tiles.mint.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{dative(name)} gözlem ekle</Text>
        <Text style={{ fontSize: 12.5, color: colors.muted, marginTop: 1 }}>Şu anki dersiniz · artı / eksi tek dokunuş</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.ink} />
    </Pressable>
  );
}

/** Dört eşit kutu: simge ve kısa ad */
function QuickGrid({ items }: { items: { label: string; icon: IconName; tone: TileTone; to: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map((q) => (
        <Pressable
          key={q.to}
          accessibilityRole="button"
          accessibilityLabel={q.label}
          onPress={() => router.push(q.to as never)}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: 'center',
            gap: 6,
            paddingVertical: 12,
            paddingHorizontal: 4,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: tiles[q.tone].bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={q.icon} size={20} color={tiles[q.tone].fg} />
          </View>
          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>
            {q.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const DAY = 86400_000;
const isoMs = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const shortDay = (iso: string) => dayTitle(iso, { day: 'numeric', month: 'long' });

/** Yaklaşanlar: önümüzdeki 30 günün en yakın 3 sınavı, etkinliği ya da tatili */
function UpcomingCard() {
  const exams = useExams();
  const events = useEvents();
  const holidays = useUpcomingHolidays();
  const now = useNow(60_000);
  const today = localIso(now);
  const until = new Date(isoMs(today) + 30 * DAY).toISOString().slice(0, 10);

  const rows: { key: string; date: string; icon: IconName; tone: TileTone; title: string; when: string }[] = [];
  for (const e of exams.data ?? []) {
    const d = localIso(new Date(e.examAt));
    if (e.isActive && Date.parse(e.examAt) >= now.getTime() && d <= until)
      rows.push({ key: `x${e.id}`, date: d, icon: 'hourglass-outline', tone: 'lilac', title: e.title, when: `${dayTitle(d)} · ${clock(e.examAt)}` });
  }
  for (const e of events.data ?? []) {
    if (e.isActive && e.date >= today && e.date <= until)
      rows.push({ key: `e${e.id}`, date: e.date, icon: 'calendar-event', tone: 'sky', title: e.title, when: [dayTitle(e.date), e.time, e.place].filter(Boolean).join(' · ') });
  }
  // Ardışık (hafta sonu arada olsa da) aynı adlı tatil günleri tek satır: "16 – 20 Kasım"
  const hs = [...(holidays.data?.holidays ?? [])].filter((h) => h.date >= today && h.date <= until).sort((a, b) => a.date.localeCompare(b.date));
  const groups: { name: string; from: string; to: string }[] = [];
  for (const h of hs) {
    const g = groups[groups.length - 1];
    if (g && g.name === h.name && isoMs(h.date) - isoMs(g.to) <= 3 * DAY) g.to = h.date;
    else groups.push({ name: h.name, from: h.date, to: h.date });
  }
  for (const g of groups) {
    const sameMonth = g.from.slice(0, 7) === g.to.slice(0, 7);
    const when = g.from === g.to ? dayTitle(g.from) : sameMonth ? `${Number(g.from.slice(8))} – ${shortDay(g.to)}` : `${shortDay(g.from)} – ${shortDay(g.to)}`;
    rows.push({ key: `h${g.from}`, date: g.from, icon: 'beach', tone: 'sun', title: g.name, when });
  }
  const list = rows.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  if (!list.length) return null;

  return (
    <>
      <SectionTitle
        right={
          <Pressable accessibilityRole="link" onPress={() => router.push('/yaklasanlar')} hitSlop={8}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <T size={13} weight="700" color={colors.faint}>
                Tümü
              </T>
              <Icon name="chevron-forward" size={14} color={colors.faint} />
            </View>
          </Pressable>
        }
      >
        Yaklaşanlar
      </SectionTitle>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {list.map((r, i) => {
          const n = Math.round((isoMs(r.date) - isoMs(today)) / DAY);
          return (
            <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: tiles[r.tone].bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={r.icon} size={19} color={tiles[r.tone].fg} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '700', color: colors.ink }}>
                  {r.title}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 12.5, color: colors.faint, marginTop: 1 }}>
                  {r.when}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: tiles[r.tone].bg }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: tiles[r.tone].fg }}>{n <= 0 ? 'Bugün' : n === 1 ? 'Yarın' : `${n} gün`}</Text>
              </View>
            </View>
          );
        })}
      </Card>
    </>
  );
}

/**
 * İzinli öğretmen yerine görevler. Okul günü sürerken: bugünün henüz bitmemiş görev dersleri ("GÖREV" satırı).
 * Gün bitince (son zilden sonra, tatil ve hafta sonunda) bugünün görevi kalkar; sonraki okul gününde görev dersi ya da
 * başkasının yerine nöbeti varsa "Yarın" (ya da gün adı) bilgisi görünür. Görev yoksa hiçbir şey görünmez.
 */
export function AssignmentNotice({ data }: { data: MeToday }) {
  const now = useNow(60_000);
  if (!data.teacher) return null;
  const todayIso = zonedParts(now, data.timezone).isoDate;
  if (!schoolDayEnded(data, now)) {
    const left = teacherDay(data, now).lessons.filter((l) => l.coverFor && l.state !== 'past');
    if (!left.length) return null;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Ders programım" onPress={() => router.push('/programim')}>
        <Card style={{ gap: 8, backgroundColor: colors.warningSoft }}>
          {left.map((l) => (
            <View key={l.period.no} style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <CoverTag />
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>
                  Bugün: {l.period.no}. ders ({l.period.start}) {classLabel(l.className)} {l.subject}
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted }}>{l.coverFor} yerine</Text>
            </View>
          ))}
        </Card>
      </Pressable>
    );
  }
  const next = data.nextSchoolDay;
  if (!next || next <= todayIso) return null;
  const word = relativeDayWord(next, todayIso);
  const lessons = (data.covers ?? []).filter((c) => c.date === next);
  const duties = (data.week.find((d) => d.date === next)?.duties ?? []).filter((d) => d.substituteFor);
  const shift = (c: { shift: 'morning' | 'afternoon' | null }) => (data.dualShift && c.shift === 'afternoon' ? 'afternoon' : 'morning');
  return (
    <>
      {lessons.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Ders programım" onPress={() => router.push('/programim')}>
          <Banner
            icon="school-outline"
            tone="warning"
            title={`${word} ${lessons.length} ek dersiniz var.`}
            text={lessons
              .map((c) => {
                const start = classDayPeriods(data, next, c.classId, shift(c)).find((p) => p.no === c.periodNo)?.start;
                return `${c.periodNo}. ders${start ? ` (${start})` : ''} ${classLabel(c.className)} ${c.subject}: ${c.absentName} yerine.`;
              })
              .join('\n')}
          />
        </Pressable>
      )}
      {duties.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Nöbetlerim" onPress={() => router.push('/nobet')}>
          <Banner
            icon="shield-checkmark-outline"
            tone="primary"
            title={`${word} nöbetiniz var: ${duties.map((d) => d.area).join(', ')}`}
            text={`${duties.map((d) => d.substituteFor).join(', ')} yerine görevlendirildiniz.`}
          />
        </Pressable>
      )}
    </>
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
