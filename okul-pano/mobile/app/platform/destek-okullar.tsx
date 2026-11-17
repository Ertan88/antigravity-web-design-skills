import { schoolFullName } from '@okulpano/shared/schoolName';
import { View } from 'react-native';
import { usePlatformSchools } from '../../src/data.ts';
import { fullDate } from '../../src/day.ts';
import { useOpenSchool } from '../../src/platform.tsx';
import { colors } from '../../src/theme.ts';
import { Badge, Button, Card, Empty, ErrorNote, Loading, Screen, T } from '../../src/ui.tsx';

/**
 * Destek erişimi olan okullar (platform yöneticisi, KVKK): yalnızca okul müdürünün şu an süreli destek erişimi verdiği
 * okullar. Okul verisine bu süre içinde, buradan girilir; süre bitince okul listeden kendiliğinden düşer.
 * Abonelik ve paket işlemleri Abonelikler ekranındadır.
 */
export default function DestekOkullar() {
  const schools = usePlatformSchools();
  const openSchool = useOpenSchool();
  const now = Date.now();
  const list = (schools.data ?? [])
    .filter((s) => !s.member && s.canOpen && s.supportAccessUntil && Date.parse(s.supportAccessUntil) > now)
    .sort((a, b) => Date.parse(a.supportAccessUntil!) - Date.parse(b.supportAccessUntil!));

  return (
    <Screen back title="Destek erişimi" subtitle="Müdürün süreli erişim verdiği okullar" refreshing={schools.isRefetching} onRefresh={() => void schools.refetch()}>
      <ErrorNote error={schools.error} />
      {schools.isLoading ? (
        <Loading />
      ) : !list.length ? (
        <Card>
          <Empty
            icon="key-outline"
            title="Destek erişimi açık okul yok"
            text="Okul müdürü panelden ya da uygulamadan 24 saatlik veya 7 günlük destek erişimi verince okul burada görünür."
          />
        </Card>
      ) : (
        list.map((s) => {
          const left = Math.ceil((Date.parse(s.supportAccessUntil!) - now) / 3600_000);
          return (
            <Card key={s.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T weight="800" lines={2}>
                    {schoolFullName(s.name, s.settings?.schoolType)}
                  </T>
                  <T size={12.5} color={colors.muted}>
                    {[s.city, `${fullDate(s.supportAccessUntil!)} tarihine kadar`].filter(Boolean).join(' · ')}
                  </T>
                </View>
                <Badge tone={left <= 24 ? 'warning' : 'success'}>{left <= 24 ? `${left} saat kaldı` : `${Math.ceil(left / 24)} gün kaldı`}</Badge>
              </View>
              <Button icon="arrow-forward" onPress={() => void openSchool(s.id)}>
                Okulu aç
              </Button>
            </Card>
          );
        })
      )}
      <T size={12} color={colors.faint} style={{ textAlign: 'center' }}>
        Okulda yapılan işlemler okulun etkinlik geçmişine düşer. Süre bitince erişim kendiliğinden kapanır.
      </T>
    </Screen>
  );
}
