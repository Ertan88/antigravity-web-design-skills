import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { Icon } from '../ui/icons';
import { AppText, IconButton, PrimaryButton, Surface } from '../ui/primitives';

const timeFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** Bildirimler: izin durumu ve kurulmuş hatırlatmaların listesi. */
export default function NotificationsScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { permission, request, plan, sendTest } = useNotifications();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="back" label="Geri" onPress={() => router.back()} />
        <AppText variant="heading" accessibilityRole="header">
          Bildirimler
        </AppText>
        <View style={{ width: 44 }} />
      </View>

      {permission === 'granted' ? (
        <Surface style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="check" size={20} color={palette.accent} strokeWidth={2.4} />
            <AppText variant="bodyStrong">Hatırlatmalar açık</AppText>
          </View>
          <AppText variant="label" muted style={{ fontFamily: fonts.body }}>
            Her ödeme için seçtiğin günlerde ve saatte bildirim gelir. Faturalarda "Ödedim" ve "2 saat ertele" butonları bulunur.
          </AppText>
          <Pressable accessibilityRole="button" onPress={() => sendTest()} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
            <AppText variant="label" color={palette.accent}>
              5 saniye içinde test bildirimi gönder
            </AppText>
          </Pressable>
        </Surface>
      ) : permission === 'unsupported' ? (
        <Surface style={{ padding: 16 }}>
          <AppText variant="body" muted>
            Bildirimler bu platformda desteklenmiyor. Telefonda dene.
          </AppText>
        </Surface>
      ) : (
        <Surface style={{ padding: 16, gap: 10 }}>
          <AppText variant="bodyStrong">Son ödeme günlerini kaçırma</AppText>
          <AppText variant="label" muted style={{ fontFamily: fonts.body }}>
            {permission === 'denied'
              ? 'Bildirim izni kapalı. Telefonun ayarlarından PayFlow için bildirimlere izin ver.'
              : 'Faturaların ve kart ekstrelerin için son ödeme gününden önce, seçtiğin saatte hatırlatalım.'}
          </AppText>
          <PrimaryButton title={permission === 'denied' ? 'Ayarları aç' : 'Bildirimlere izin ver'} onPress={() => (permission === 'denied' ? Linking.openSettings() : request())} />
        </Surface>
      )}

      <AppText variant="heading" accessibilityRole="header">
        Yaklaşan hatırlatmalar
      </AppText>
      {plan.length === 0 ? (
        <AppText variant="body" muted>
          Önümüzdeki 45 günde kurulacak hatırlatma yok.
        </AppText>
      ) : (
        plan.slice(0, 20).map((p) => (
          <View key={p.id} accessible accessibilityLabel={`${timeFmt.format(p.fireAt)}, ${p.title}, ${p.body}`} style={{ flexDirection: 'row', gap: 12, backgroundColor: palette.surface, borderRadius: 16, padding: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: p.title.includes('bugün') ? palette.warnBg : palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={p.category === 'info' ? 'doc' : 'bell'} size={18} color={p.title.includes('bugün') ? palette.warn : palette.muted} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="caption" muted>
                {timeFmt.format(p.fireAt)}
              </AppText>
              <AppText variant="bodyStrong" style={{ fontSize: 14 }}>
                {p.title}
              </AppText>
              <AppText variant="caption" muted>
                {p.body}
              </AppText>
            </View>
          </View>
        ))
      )}
      {plan.length > 20 ? (
        <AppText variant="caption" muted>
          + {plan.length - 20} hatırlatma daha
        </AppText>
      ) : null}
    </ScrollView>
  );
}
