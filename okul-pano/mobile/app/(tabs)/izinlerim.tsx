import { router } from 'expo-router';
import { View } from 'react-native';
import { useMyLeaves } from '../../src/data.ts';
import { dayTitle } from '../../src/day.ts';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, Empty, Loading, Screen, T } from '../../src/ui.tsx';

const STATUS = {
  approved: { label: 'Onaylandı', tone: 'success' },
  pending: { label: 'Onay bekliyor', tone: 'warning' },
  rejected: { label: 'Reddedildi', tone: 'danger' },
} as const;

/** Öğretmenin izinleri: bildirdikleri ve durumları; yeni izin bildirimi */
export default function Izinlerim() {
  const leaves = useMyLeaves();
  const list = leaves.data ?? [];
  return (
    <Screen
      title="İzinlerim"
      refreshing={leaves.isRefetching}
      onRefresh={() => void leaves.refetch()}
      right={
        <Button size="sm" icon="add" onPress={() => router.push('/izin')}>
          İzin bildir
        </Button>
      }
    >
      {leaves.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <Card>
          <Empty
            icon="calendar-clear-outline"
            title="Henüz izin bildirmediniz"
            text="İzniniz onaylanınca panoda izinli görünür; nöbetiniz varsa yöneticiniz yerine birini görevlendirir."
          />
          <Button icon="add" onPress={() => router.push('/izin')}>
            İzin bildir
          </Button>
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {list.map((l, i) => {
            const st = STATUS[l.approvalStatus];
            return (
              <View
                key={l.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: '#eef2f5' }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T weight="700">
                    {l.startDate === l.endDate
                      ? dayTitle(l.startDate, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })
                      : `${dayTitle(l.startDate, { day: 'numeric', month: 'long', year: 'numeric' })} – ${dayTitle(l.endDate, { day: 'numeric', month: 'long', year: 'numeric' })}`}
                  </T>
                  {l.note ? (
                    <T size={13} color={colors.muted} lines={1}>
                      {l.note}
                    </T>
                  ) : null}
                </View>
                <Badge tone={st.tone}>{st.label}</Badge>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
