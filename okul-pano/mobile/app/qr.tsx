import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { codeFromQr } from '../src/pair.tsx';
import { colors } from '../src/theme.ts';
import { Button, Card, Empty, Screen, T } from '../src/ui.tsx';

/** QR ile pano bağlama: televizyondaki eşleştirme ekranında görünen QR kodu okutulur */
export default function Qr() {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  if (!permission)
    return (
      <Screen back title="QR ile bağla">
        {null}
      </Screen>
    );
  if (!permission.granted) {
    return (
      <Screen back title="QR ile bağla">
        <Card style={{ gap: 12 }}>
          <Empty
            icon="camera-outline"
            title="Kamera izni gerekli"
            text="Panodaki QR kodu okutmak için kameraya izin verin. İzin vermezseniz 6 haneli kodu elle de yazabilirsiniz."
          />
          <Button icon="camera-outline" onPress={() => void requestPermission()}>
            Kameraya izin ver
          </Button>
        </Card>
      </Screen>
    );
  }
  return (
    <Screen back title="QR ile bağla" scroll={false}>
      <T color={colors.muted}>Televizyondaki eşleştirme ekranında görünen QR kodu çerçeveye getirin.</T>
      <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000', minHeight: 320 }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (done.current) return;
            const code = codeFromQr(data);
            if (!code) return setError('Bu QR bir Okul Yayın pano kodu değil.');
            done.current = true;
            router.replace(`/eslestir/${code}`);
          }}
        />
      </View>
      {error && (
        <T color={colors.danger} weight="600" style={{ textAlign: 'center' }}>
          {error}
        </T>
      )}
    </Screen>
  );
}
