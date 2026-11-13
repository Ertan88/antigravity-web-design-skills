import { coverBandText, relativeDayWord } from '@okulpano/shared/coverText';
import { EMERGENCY_INFO } from '@okulpano/shared/emergency';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from './text.tsx';
import { membershipLabel, useAuth } from './auth.tsx';
import { useControlCenter, useDutyDay, useMeToday, useSchoolQuery, type ControlCenter, type DutyDay } from './data.ts';
import { clock, timeAgo } from './day.ts';
import { LiveLesson } from './lesson.tsx';
import { QuickAdd } from './quick.tsx';
import { AssignmentNotice, DayBanner, MyDayCard, NotificationsButton } from './teacher.tsx';
import { tiles } from './theme.ts';
import { Banner, BentoRow, Card, ErrorNote, HomeHeader, ListRow, Loading, Screen, SectionTitle, Tile } from './ui.tsx';
import { WebAppStrips } from './webStrips.tsx';

/**
 * Koyu pano kutusu: kaç pano çevrimiçi. Kapalı pano varsa yalnızca ilki adıyla ve en son ne zaman görüldüğüyle yazılır,
 * kalanlar sayıyla ("ve 2 pano daha"); okulda çok pano olsa da kutu uzamaz. Ayrıntı Panolar ekranında.
 */
function ScreensTile({ screens, style }: { screens: ControlCenter['screens']; style?: object }) {
  const t = tiles.ink;
  const first = screens.offline[0];
  const more = screens.offline.length - 1;
  return (
    <Tile
      tone="ink"
      icon="tv-outline"
      label="Panolar"
      value={screens.online}
      unit={`/${screens.total}`}
      caption={screens.total === 0 ? 'Henüz pano eklenmedi' : first ? 'çevrimiçi' : 'hepsi çevrimiçi'}
      onPress={() => router.push('/panolar')}
      style={style}
    >
      {first ? (
        <View style={{ marginTop: 8, gap: 2 }}>
          <Row dot="#f43f5e" name={first.name} />
          <Text style={{ fontSize: 11.5, fontWeight: '600', color: t.sub }} numberOfLines={2}>
            {first.lastSeenAt ? `${timeAgo(first.lastSeenAt)} görüldü` : 'Hiç bağlanmadı'}
            {more > 0 ? `; ${more} pano daha kapalı` : ''}
          </Text>
        </View>
      ) : null}
    </Tile>
  );
}

function Row({ dot, name, when }: { dot: string; name: string; when?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: '#fff' }} numberOfLines={1}>
        {name}
      </Text>
      {when ? <Text style={{ fontSize: 11, fontWeight: '600', color: tiles.ink.sub }}>{when}</Text> : null}
    </View>
  );
}

/** Yöneticinin ana ekranı: bento kontrol merkezi */
/** Gösterilen günün boşlukları (yalnızca bant için gereken alanlar); gün bitince sonraki okul günü */
interface CoverSummary {
  date: string;
  today: string;
  holiday: string | null;
  absent: { fullName: string }[];
  lessons: { cover: unknown }[];
  duties: { substitute: unknown }[];
}

export function ManagerHome() {
  const { me: account, school, role, isTeacher, can } = useAuth();
  const center = useControlCenter();
  // İzinli öğretmenin boş dersleri ve nöbet yeri: tek satır uyarı; atama Ders görevlendirme ekranında
  const cover = useSchoolQuery<CoverSummary>('cover-day', { enabled: can('duties.manage'), refetchInterval: 60_000 });
  const openLessons = cover.data && !cover.data.holiday ? cover.data.lessons.filter((l) => !l.cover).length : 0;
  const openDuties = cover.data && !cover.data.holiday ? cover.data.duties.filter((d) => !d.substitute).length : 0;
  const me = useMeToday();
  // Nöbet alt menüde değil: bugünkü nöbetçi sayısı ve boş yer Merkez'deki Nöbet kutusunda
  const duty = useDutyDay();
  const c = center.data;

  // Pano durumu kutuda, onaylar alt menüde; listede yalnızca kutulara sığmayan işler kalır
  const attention = c
    ? [
        // Boş nöbet yerleri üstteki uyarı bandında (nöbet yetkisi olana); yetkisi yoksa burada bilgi olarak
        ...(can('duties.manage')
          ? []
          : c.dutyGaps.map((g) => ({
              key: `gap-${g.dutyId}`,
              icon: 'shield-checkmark-outline' as const,
              tone: 'warning' as const,
              title: `${g.area} nöbeti boş`,
              subtitle: `${g.teacherName} bugün izinli`,
              to: '/nobet',
            }))),
        ...(c.endingToday.length
          ? [
              {
                key: 'ending',
                icon: 'calendar-outline' as const,
                tone: 'primary' as const,
                title: `${c.endingToday.length} duyurunun süresi bugün bitiyor`,
                subtitle: c.endingToday.map((a) => a.title).slice(0, 2).join(' · '),
                to: '/duyurular',
              },
            ]
          : []),
      ]
    : [];

  return (
    <Screen refreshing={center.isRefetching} onRefresh={() => void center.refetch()}>
      <HomeHeader name={account?.user.fullName} school={school?.name} schoolType={school?.schoolType} role={school?.support ? 'Destek erişimi' : school ? membershipLabel(school) : 'Yönetici'}>
        <NotificationsButton />
      </HomeHeader>
      <WebAppStrips />
      <ErrorNote error={center.error} />
      {!c ? (
        <Loading />
      ) : (
        <>
          {c.emergency && (
            <Pressable accessibilityRole="button" onPress={() => router.push('/acil')}>
              <Banner tone="danger" icon="warning" title={`Acil durum sürüyor: ${EMERGENCY_INFO[c.emergency.type].label}`} text={[clock(c.emergency.startedAt), c.emergency.startedBy].filter(Boolean).join(' · ')} />
            </Pressable>
          )}
          {openLessons + openDuties > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Ders görevlendirmeyi aç" onPress={() => router.push('/gorevlendirme')}>
              <Banner
                tone="warning"
                icon="people-outline"
                title={coverBandText(cover.data!.absent.map((a) => a.fullName), openLessons, openDuties, relativeDayWord(cover.data!.date, cover.data!.today)).title}
                text={`${coverBandText(cover.data!.absent.map((a) => a.fullName), openLessons, openDuties).detail} Görevlendirmek için dokunun.`}
              />
            </Pressable>
          )}
          {me.data ? <DayBanner data={me.data} /> : c.holiday ? <Banner icon="sunny" title="Bugün tatil" text={`${c.holiday}. Zil çalmıyor.`} /> : null}
          {me.data && <LiveLesson data={me.data} link />}
          {me.data && <AssignmentNotice data={me.data} />}

          {/* Onaylar alt menüde; burada kutusu yok */}
          <BentoRow>
            <ScreensTile screens={c.screens} style={{ flex: 1 }} />
            <Tile tone="mint" icon="radio-outline" label="Yayında" value={c.onAir} caption="içerik" onPress={() => router.push('/duyurular')} style={{ flex: 1 }} />
          </BentoRow>

          <BentoRow>
            <DutyTile day={duty.data} style={{ flex: 1 }} />
            <Tile
              tone={cover.data?.absent.length ? 'sun' : 'paper'}
              icon="people-outline"
              label="İzinli"
              value={cover.data?.holiday ? '–' : (cover.data?.absent.length ?? '–')}
              // Son zilden sonra görevlendirme ertesi okul gününe geçer; kutu da hangi günü gösterdiğini yazar
              caption={!cover.data ? null : absentText(relativeDayWord(cover.data.date, cover.data.today), cover.data.holiday, cover.data.absent.map((a) => a.fullName))}
              onPress={() => router.push(can('duties.manage') ? '/gorevlendirme' : '/nobet')}
              style={{ flex: 1 }}
            />
          </BentoRow>

          {attention.length > 0 && (
            <>
              <SectionTitle>İlgilenmeniz gerekenler</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {attention.map((a, i) => (
                  <ListRow key={a.key} icon={a.icon} iconTone={a.tone} title={a.title} subtitle={a.subtitle} onPress={() => router.push(a.to as never)} last={i === attention.length - 1} />
                ))}
              </Card>
            </>
          )}

          <QuickAdd only={['Duyuru', 'Kayan yazı']} />

          {isTeacher && me.data?.teacher && (
            <>
              <SectionTitle>Benim günüm</SectionTitle>
              <MyDayCard data={me.data} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

/** İzinli kutusunun alt yazısı: "Bugün: Emine Koç, Murat Aslan ve 1 kişi daha" */
function absentText(day: string, holiday: string | null, names: string[]) {
  if (holiday) return `${day}: tatil`;
  if (!names.length) return `${day}: izinli yok`;
  const shown = names.slice(0, 2).join(', ');
  return names.length > 2 ? `${day}: ${shown} ve ${names.length - 2} kişi daha` : `${day}: ${shown}`;
}

/** Merkez'deki Nöbet kutusu: bugün kaç kişi nöbette, boş yer varsa sayısı; dokununca nöbet çizelgesi */
function DutyTile({ day, style }: { day: DutyDay | undefined; style?: object }) {
  const people = day ? new Set(day.entries.map((e) => (e.onLeave ? e.substitute?.teacherId : e.teacherId)).filter(Boolean)).size : 0;
  const open = day ? day.entries.filter((e) => e.onLeave && !e.substitute).length : 0;
  return (
    <Tile
      tone={open ? 'peach' : 'mint'}
      icon="shield-checkmark-outline"
      label="Nöbet"
      value={!day || day.holiday ? '–' : people}
      caption={!day ? null : day.holiday ? 'Bugün tatil' : !day.entries.length ? 'Bugün nöbet girilmemiş' : open ? `nöbetçi, ${open} yer boş` : 'nöbetçi, bütün yerler dolu'}
      onPress={() => router.push('/nobet')}
      style={style}
    />
  );
}
