import { Pressable, View } from 'react-native';
import { clearSaved } from './persist.ts';
import { Text } from './text.tsx';
import { colors } from './theme.ts';

/**
 * Beklenmeyen bir ekran hatasında uygulama kapanmaz: kısa bir açıklama ve "Yeniden dene" görünür. Yeniden denerken
 * telefonda saklanan veriler silinir (hata eski bir kayıttan kaynaklandıysa düzelsin).
 */
export function ErrorBoundary({ retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>Bir sorun oluştu</Text>
      <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>Ekran açılırken beklenmeyen bir hata oldu. Yeniden denediğinizde güncel veriler sunucudan alınır.</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void clearSaved().finally(() => void retry())}
        style={{ marginTop: 6, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13 }}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: '800', fontSize: 15 }}>Yeniden dene</Text>
      </Pressable>
    </View>
  );
}
