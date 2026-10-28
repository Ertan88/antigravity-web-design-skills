import { EMERGENCY_INFO } from '@okulpano/shared/emergency';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from './auth.tsx';
import { useControlCenter, useMeToday } from './data.ts';
import { clock, timeAgo } from './day.ts';
import { MenuButton, QuickAdd } from './quick.tsx';
import { NotificationsButton, SchoolBadge, TodayDutyCard } from './teacher.tsx';
import { colors } from './theme.ts';
import { Card, Empty, ErrorNote, Icon, ListRow, Loading, Screen, SectionTitle, T } from './ui.tsx';

function Stat({ value, label, to }: { value: string | number; label: string; to: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(to as never)}
      style={({ pressed }) => ({ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, gap: 2, opacity: pressed ? 0.75 : 1 })}
    >
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
    </Pressable>
  );
}

/** Yöneticinin ana ekranı: kontrol merkezi (tasarım 7) */
export function ManagerHome() {
  const { school, role, isTeacher } = useAuth();
  const center = useControlCenter();
  const me = useMeToday();
  const c = center.data;

  const attention = c
    ? [
        ...(c.emergency
          ? [{ key: 'emergency', icon: 'warning' as const, tone: 'danger' as const, title: `Acil durum sürüyor: ${EMERGENCY_INFO[c.emergency.type].label}`, subtitle: `${clock(c.emergency.startedAt)} · ${c.emergency.startedBy ?? ''}`, to: '/acil' }]
          : []),
        ...c.dutyGaps.map((g) => ({
          key: `gap-${g.dutyId}`,
          icon: 'shield-checkmark-outline' as const,
          tone: 'warning' as const,
          title: `${g.area} nöbeti boş`,
          subtitle: `${g.teacherName} bugün izinli · yerine atayın`,
          to: '/nobet',
        })),
        ...c.screens.offline.map((s) => ({
          key: `screen-${s.id}`,
          icon: 'tv-outline' as const,
          tone: 'warning' as const,
          title: `${s.name} panosu çevrimdışı`,
          subtitle: s.lastSeenAt ? `Son görülme ${timeAgo(s.lastSeenAt)} · elektrik ya da internet kontrol edilmeli` : 'Hiç bağlanmadı',
          to: `/pano/${s.id}`,
        })),
        ...(c.pending.announcements + c.pending.leaves > 0
          ? [
              {
                key: 'pending',
                icon: 'checkmark-done-outline' as const,
                tone: 'primary' as const,
                title: `${c.pending.announcements + c.pending.leaves} içerik onay bekliyor`,
                subtitle: [c.pending.announcements ? `${c.pending.announcements} duyuru` : null, c.pending.leaves ? `${c.pending.leaves} izin` : null].filter(Boolean).join(' · '),
                to: '/onaylar',
              },
            ]
          : []),
        ...(c.endingToday.length
          ? [
              {
                key: 'ending',
                icon: 'calendar-outline' as const,
                tone: 'primary' as const,
                title: `${c.endingToday.length} duyurunun süresi bugün bitiyor`,
                subtitle: c.endingToday.map((a) => a.title).slice(0, 2).join(' · '),
                to: '/yayin-akisi',
              },
            ]
          : []),
      ]
    : [];


  return (
    <Screen refreshing={center.isRefetching} onRefresh={() => void center.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 }}>
        <SchoolBadge name={school?.name ?? 'O'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={12} weight="700" color={colors.primary}>
            {school?.support ? 'DESTEK ERİŞİMİ' : role === 'owner' ? 'OKUL SAHİBİ' : 'YÖNETİCİ'}
          </T>
          <T size={18} weight="800">
            Merkez
          </T>
          <T size={13} color={colors.muted} lines={1}>
            {c?.holiday ? `Tatil · ${c.holiday}` : (school?.name ?? 'Normal gün')}
          </T>
        </View>
        <NotificationsButton />
        <MenuButton />
      </View>
      <ErrorNote error={center.error} />
      {!c ? (
        <Loading />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat value={`${c.screens.online}/${c.screens.total}`} label="pano çevrimiçi" to="/panolar" />
            <Stat value={c.pending.announcements + c.pending.leaves} label="onay bekliyor" to="/onaylar" />
            <Stat value={c.onAir} label="içerik yayında" to="/yayin-akisi" />
          </View>

          <SectionTitle>İlgilenmeniz gerekenler</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {attention.length ? (
              attention.map((a, i) => (
                <ListRow key={a.key} icon={a.icon} iconTone={a.tone} title={a.title} subtitle={a.subtitle} onPress={() => router.push(a.to as never)} last={i === attention.length - 1} />
              ))
            ) : (
              <Empty icon="checkmark-circle-outline" title="Her şey yolunda" text="Boş nöbet, kapalı pano ya da bekleyen onay yok." />
            )}
          </Card>

          {/* "Benim günüm" kartı yer kapladığı için öğretmen kaydı olan yöneticide üç hızlı ekleme; diğerleri Menü › İçerik'te */}
          <QuickAdd max={isTeacher ? 3 : 6} />

          {isTeacher && me.data && (
            <>
              <SectionTitle right={<Icon name="person-outline" size={18} color={colors.muted} />}>Benim günüm</SectionTitle>
              <TodayDutyCard data={me.data} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
