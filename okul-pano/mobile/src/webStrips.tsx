import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Text } from './text.tsx';
import { Icon } from './ui.tsx';

/** Panelden gelindi mi (adres /app/?panelden=1): bu oturum boyunca "Paneli aç" bağlantısı görünür */
function cameFromPanel(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('panelden') === '1') sessionStorage.setItem('okulpano.panelden', '1');
    return sessionStorage.getItem('okulpano.panelden') === '1';
  } catch {
    return false;
  }
}

function isAndroidBrowser(): boolean {
  try {
    return /Android/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

const BRAND = '#0E5E66';

/**
 * Uygulamanın web sürümünde (/app) ana ekranın başı: panelden gelene "Paneli aç", Android tarayıcısında uygulamayı
 * indirme şeridi (nöbet hatırlatmaları ve bildirimler uygulamada güvenilir çalışır). Telefon uygulamasında görünmez.
 */
export function WebAppStrips() {
  const [panel] = useState(() => (Platform.OS === 'web' ? cameFromPanel() : false));
  const [android] = useState(() => (Platform.OS === 'web' ? isAndroidBrowser() : false));
  if (Platform.OS !== 'web' || (!panel && !android)) return null;
  return (
    <View style={{ gap: 10 }}>
      {panel && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1c1917', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 }}>
          <Icon name="phone-portrait-outline" size={18} color="#f5f3ef" />
          <Text style={{ flex: 1, color: '#f5f3ef', fontSize: 13, fontWeight: '600' }}>Telefon için uygulama görünümü açıldı.</Text>
          <Pressable accessibilityRole="link" onPress={() => window.location.assign('/admin/?panel=1')} hitSlop={8}>
            <Text style={{ color: '#99f6e4', fontSize: 13, fontWeight: '800' }}>Paneli aç</Text>
          </Pressable>
        </View>
      )}
      {android && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BRAND, borderRadius: 18, padding: 14 }}>
          <Icon name="download-outline" size={22} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '800' }}>Android uygulaması</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '600' }}>Nöbet hatırlatmaları ve bildirimler için</Text>
          </View>
          <Pressable accessibilityRole="link" onPress={() => window.location.assign('/indir')} style={{ backgroundColor: '#fff', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 }}>
            <Text style={{ color: BRAND, fontSize: 13, fontWeight: '800' }}>İndir</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
