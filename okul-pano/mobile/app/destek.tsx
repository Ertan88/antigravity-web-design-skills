import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../src/api.ts';
import { useAuth, useSchoolPath } from '../src/auth.tsx';
import { useSchoolInfo, type SchoolInfo } from '../src/data.ts';
import { clock, fullDate } from '../src/day.ts';
import { colors } from '../src/theme.ts';
import { Badge, Button, Card, Empty, ErrorNote, Loading, Screen, T } from '../src/ui.tsx';

/**
 * Destek erişimi (KVKK): platform desteği okulun verilerini varsayılan olarak göremez. Yardım gerektiğinde okul sahibi
 * (müdür) 24 saat ya da 7 gün erişim verir; süre dolunca kendiliğinden kapanır, işlemler etkinlik geçmişine düşer.
 */
export default function Destek() {
  const { school, role, me } = useAuth();
  const info = useSchoolInfo();
  const path = useSchoolPath('support-access');
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: (hours: 0 | 24 | 168) => api<SchoolInfo>(path, { method: 'POST', body: { hours } }),
    onSuccess: (data) => qc.setQueryData([school?.id, ''], data),
  });

  if (role !== 'owner' || school?.support || me?.user.isSuperAdmin) {
    return (
      <Screen back title="Destek erişimi">
        <Card>
          <Empty icon="lock-closed-outline" title="Destek erişimini yalnızca okul sahibi (müdür) verir" />
        </Card>
      </Screen>
    );
  }

  const until = info.data?.supportAccessUntil ?? null;
  const open = Boolean(until && Date.parse(until) > Date.now());
  return (
    <Screen back title="Destek erişimi" refreshing={info.isRefetching} onRefresh={() => void info.refetch()}>
      {info.isLoading ? (
        <Loading />
      ) : (
        <>
          <Card style={{ gap: 10 }}>
            <Badge tone={open ? 'success' : 'muted'}>{open ? 'Açık' : 'Kapalı'}</Badge>
            {open && until && (
              <T weight="700">
                {fullDate(until)} saat {clock(until)} tarihine kadar açık
              </T>
            )}
            <T size={14} color={colors.muted}>
              Okulunuzun verilerini (öğretmenler, öğrenciler, nöbetler) platform desteği göremez. Yardım istediğinizde süreli erişim verin; süre dolunca
              kendiliğinden kapanır. Destek sırasında yapılan işlemler Etkinlik geçmişinde görünür.
            </T>
          </Card>
          <ErrorNote error={set.error} />
          {open ? (
            <Button variant="danger" icon="lock-closed-outline" loading={set.isPending} onPress={() => set.mutate(0)}>
              Erişimi şimdi kapat
            </Button>
          ) : (
            <>
              <Button icon="key-outline" loading={set.isPending && set.variables === 24} onPress={() => set.mutate(24)}>
                24 saat erişim ver
              </Button>
              <Button variant="secondary" loading={set.isPending && set.variables === 168} onPress={() => set.mutate(168)}>
                7 gün erişim ver
              </Button>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
