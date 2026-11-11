import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { QrCode } from '../src/qr.tsx';
import { Text } from '../src/text.tsx';
import { colors } from '../src/theme.ts';
import { Button, Card, Screen, T } from '../src/ui.tsx';

/**
 * Tam ekran giriş kodu ya da toplantı QR'ı: yetkilinin telefonunda öğretmene gösterilir. Ekran açık kalır;
 * kod yalnızca bu ekranda görünür (kâğıda yazılmaz), süresi dolunca işe yaramaz.
 */
export default function GirisKodu() {
  useKeepAwake();
  const { code, url, until, name, role } = useLocalSearchParams<{ code?: string; url: string; until: string; name?: string; role?: string }>();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(until).getTime() - now);
  const expired = left === 0;
  const mm = Math.floor(left / 60000);
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  const meeting = !code;
  return (
    <Screen
      back
      title={meeting ? "Toplantı QR'ı" : 'Giriş kodu'}
      subtitle={meeting ? 'Öğretmenler okutup kadrodan adını seçer' : [name, role].filter(Boolean).join(' · ')}
      footer={
        <Button variant="secondary" onPress={() => router.back()}>
          Kapat
        </Button>
      }
    >
      <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 22 }}>
        <View style={{ opacity: expired ? 0.15 : 1, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
          <QrCode value={url} size={230} />
        </View>
        {code ? (
          <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: 5, color: colors.ink, fontVariant: ['tabular-nums'] }}>
            {code.slice(0, 4)}-{code.slice(4)}
          </Text>
        ) : null}
        <View style={{ backgroundColor: expired ? colors.dangerSoft : colors.warningSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: expired ? colors.danger : colors.warning }}>
            {expired ? 'Süresi doldu' : `${mm}:${ss} ${meeting ? 'daha geçerli' : 'içinde kullanılmalı'}`}
          </Text>
        </View>
        <T size={13.5} color={colors.muted} style={{ textAlign: 'center', lineHeight: 20 }}>
          {meeting
            ? 'Öğretmenler kendi telefonuyla okutur, adını seçer, e-postasını doğrular ve şifresini belirler. Hesaplar siz onaylayınca açılır.'
            : 'Öğretmen kendi telefonuyla bu QR’ı okutur ya da uygulamada “Giriş kodum var”a kodu yazar. Kod bir kez kullanılır.'}
        </T>
      </Card>
      <T size={12} color={colors.faint} style={{ textAlign: 'center' }}>
        Ekran bu sayfa açıkken kilitlenmez. Kodu kâğıda yazmayın.
      </T>
    </Screen>
  );
}
