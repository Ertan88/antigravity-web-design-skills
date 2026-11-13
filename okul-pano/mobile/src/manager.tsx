import { EMERGENCY_INFO } from '@okulpano/shared/emergency';
import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { membershipLabel, useAuth } from './auth.tsx';
import { useControlCenter, useDutyDay, useExamSchedule, useMeToday, useSchoolQuery, type ControlCenter, type DutyDay } from './data.ts';
import { BellStrip, DayFlow, StatusCards, type StatusCard } from './dayFlow.tsx';
import { clock } from './day.ts';
import { QuickAdd } from './quick.tsx';
import { AssignmentNotice, DayBanner, MyDayCard, NotificationsButton } from './teacher.tsx';
import { Banner, Card, ErrorNote, HomeHeader, ListRow, Loading, Screen, SectionTitle } from './ui.tsx';
import { WebAppStrips } from './webStrips.tsx';

/** Yöneticinin ana ekranı: bento kontrol merkezi */
/** Gösterilen günün boşlukları (yalnızca bant için gereken alanlar); gün bitince sonraki okul günü */
interface CoverSummary {
  date: string;
  today: string;
  holiday: string | null;
  absent: { fullName: string }[];
  lessons: { cover: unknown; periodNo: number; className: string }[];
  duties: { substitute: unknown }[];
}

export function ManagerHome() {
  const { me: account, school, isTeacher, can } = useAuth();
  const center = useControlCenter();
  // İzinli öğretmenin boş dersleri ve nöbet yeri: tek satır uyarı; atama Ders görevlendirme ekranında
  const cover = useSchoolQuery<CoverSummary>('cover-day', { enabled: can('duties.manage'), refetchInterval: 60_000 });
  const openLessons = cover.data && !cover.data.holiday ? cover.data.lessons.filter((l) => !l.cover).length : 0;
  const me = useMeToday();
  // Nöbet alt menüde değil: bugünkü nöbetçi sayısı ve boş yer Merkez'deki Nöbet kutusunda
  const duty = useDutyDay();
  const c = center.data;
  const exams = useExamSchedule();

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
          {me.data ? <DayBanner data={me.data} /> : c.holiday ? <Banner icon="sunny" title="Bugün tatil" text={`${c.holiday}. Zil çalmıyor.`} /> : null}
          {me.data && <AssignmentNotice data={me.data} />}
          {me.data && <BellStrip data={me.data} />}
          <StatusCards cards={statusCards(c, cover.data, duty.data, can('duties.manage'), openLessons)} />
          {me.data && cover.data !== undefined && (
            <>
              <SectionTitle>Bugünün akışı</SectionTitle>
              <DayFlow
                data={me.data}
                // Boş dersler yalnızca bugünü gösteriyorsa akışa girer (son zilden sonra görevlendirme ertesi güne geçer)
                gaps={cover.data && cover.data.date === cover.data.today && !cover.data.holiday ? cover.data.lessons.map((l) => ({ periodNo: l.periodNo, className: l.className, covered: Boolean(l.cover) })) : []}
                exams={(exams.data?.exams ?? []).filter((e) => e.date === exams.data?.today).map((e) => ({ periodNo: e.periodNo, start: e.start, label: `${e.classLabel} ${e.subject}` }))}
                ending={c.endingToday.map((a) => a.title)}
                canCover={can('duties.manage')}
              />
            </>
          )}

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

/** Yana kaydırılan durum kartları: İzinli (boş ders varsa uyarı renginde), Nöbet, Panolar, Yayında */
function statusCards(c: ControlCenter, cover: CoverSummary | undefined, duty: DutyDay | undefined, canCover: boolean, openLessons: number): StatusCard[] {
  const open = duty ? duty.entries.filter((e) => e.onLeave && !e.substitute).length : 0;
  const people = duty ? new Set(duty.entries.map((e) => (e.onLeave ? e.substitute?.teacherId : e.teacherId)).filter(Boolean)).size : 0;
  const off = c.screens.offline;
  return [
    {
      key: 'absent',
      tone: openLessons ? 'peach' : cover?.absent.length ? 'sun' : 'paper',
      icon: 'people-outline',
      label: 'İzinli',
      value: cover?.holiday ? '–' : (cover?.absent.length ?? '–'),
      caption: !cover ? '' : cover.holiday ? 'Bugün tatil' : openLessons ? `${openLessons} ders boş` : cover.absent.length ? 'Dersler görevlendirildi' : 'İzinli yok',
      to: canCover ? '/gorevlendirme' : '/nobet',
    },
    {
      key: 'duty',
      tone: open ? 'peach' : 'mint',
      icon: 'shield-checkmark-outline',
      label: 'Nöbet',
      value: !duty || duty.holiday ? '–' : people,
      caption: !duty ? '' : duty.holiday ? 'Bugün tatil' : !duty.entries.length ? 'Nöbet girilmemiş' : open ? `${open} yer boş` : 'Bütün yerler dolu',
      to: '/nobet',
    },
    {
      key: 'screens',
      tone: 'ink',
      icon: 'tv-outline',
      label: 'Panolar',
      value: `${c.screens.online}/${c.screens.total}`,
      caption: c.screens.total === 0 ? 'Pano eklenmedi' : off.length ? (off.length === 1 ? `${off[0]!.name} kapalı` : `${off.length} pano kapalı`) : 'Hepsi çevrimiçi',
      to: '/panolar',
    },
    { key: 'air', tone: 'mint', icon: 'radio-outline', label: 'Yayında', value: c.onAir, caption: 'içerik', to: '/duyurular' },
  ];
}
