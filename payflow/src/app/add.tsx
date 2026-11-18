import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { AppText, IconButton, Surface } from '../ui/primitives';

/** Hızlı ekle — Adım 3'te Kart / Fatura / Günlük giriş formlarıyla doldurulacak. */
export default function AddScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: insets.top + 12, paddingHorizontal: 20, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="close" label="Kapat" onPress={() => router.back()} />
        <AppText variant="heading" accessibilityRole="header">
          Yeni kayıt
        </AppText>
        <View style={{ width: 44 }} />
      </View>
      <Surface style={{ padding: 20 }}>
        <AppText variant="body" muted>
          Kart harcaması, fatura ve günlük harcama girişi Adım 3'te bu ekrana gelecek.
        </AppText>
      </Surface>
    </View>
  );
}
