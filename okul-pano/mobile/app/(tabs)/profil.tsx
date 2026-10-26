import { ROLES } from '@okulpano/shared/permissions';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useAuth } from '../../src/auth.tsx';
import { registerForPush } from '../../src/push.ts';
import { colors } from '../../src/theme.ts';
import { Button, Card, Chip, ListRow, Screen, SectionTitle, T } from '../../src/ui.tsx';

/** Profil: hesap, okul seçimi (birden çok okul), bildirimler, çıkış */
export default function Profil() {
  const { me, school, server, isTeacher, isManager, selectSchool, signOut } = useAuth();
  const [push, setPush] = useState<string | null>(null);
  return (
    <Screen title="Profil" back={isManager}>
      <Card style={{ gap: 4 }}>
        <T size={18} weight="800">
          {me?.user.fullName}
        </T>
        <T color={colors.muted}>{me?.user.email}</T>
        <T size={13} color={colors.muted}>
          {school ? `${school.name} · ${ROLES[school.role]}${isTeacher ? ' · öğretmen' : ''}` : ''}
        </T>
      </Card>

      {(me?.schools.length ?? 0) > 1 && (
        <>
          <SectionTitle>Okul</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {me!.schools.map((s) => (
              <Chip key={s.id} label={s.name} selected={s.id === school?.id} onPress={() => void selectSchool(s.id)} />
            ))}
          </View>
        </>
      )}

      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {isTeacher && <ListRow icon="calendar-outline" title="İzin bildir" onPress={() => router.push('/izin')} />}
        <ListRow icon="notifications-outline" title="Bildirimler" onPress={() => router.push('/bildirimler')} />
        <ListRow icon="server-outline" iconTone="muted" title="Sunucu" subtitle={server.replace(/^https?:\/\//, '')} last />
      </Card>

      {Platform.OS !== 'web' && (
        <Button
          variant="secondary"
          icon="notifications-outline"
          onPress={() =>
            void registerForPush().then((r) =>
              setPush(r === 'ok' ? 'Bu telefon bildirim alacak.' : r === 'denied' ? 'Bildirim izni verilmedi: telefon ayarlarından açabilirsiniz.' : 'Bu cihazda telefon bildirimi kullanılamıyor.'),
            )
          }
        >
          Telefon bildirimlerini aç
        </Button>
      )}
      {push && (
        <T size={13} color={colors.muted} style={{ textAlign: 'center' }}>
          {push}
        </T>
      )}

      <Button variant="ghost" icon="log-out-outline" onPress={() => void signOut()}>
        Çıkış yap
      </Button>
    </Screen>
  );
}
