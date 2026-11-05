import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/auth.tsx';
import { codeFromQr, PairCard } from '../../src/pair.tsx';
import { Card, Empty, Screen } from '../../src/ui.tsx';

/**
 * Eşleştirme bağlantısı (okulpano://eslestir/KOD): uygulamadaki QR okuyucudan ya da telefonun kendi kamerasından
 * açılır; kod hazır gelir, yalnızca pano adı yazılır.
 */
export default function Eslestir() {
  const { kod } = useLocalSearchParams<{ kod: string }>();
  const { can, school } = useAuth();
  const code = codeFromQr(kod ?? '');
  return (
    <Screen back title="Yeni pano bağla" subtitle={school?.name}>
      {!can('screens.manage') ? (
        <Card>
          <Empty icon="lock-closed-outline" title="Pano bağlama yetkiniz yok" text="Okul yöneticinizden Ekranlar yetkisi isteyin." />
        </Card>
      ) : !code ? (
        <Card>
          <Empty icon="alert-circle-outline" title="Kod okunamadı" />
        </Card>
      ) : (
        <PairCard initialCode={code} onDone={() => router.replace('/panolar')} />
      )}
    </Screen>
  );
}
