import { errorText } from '@okulpano/shared';
import { useState } from 'react';
import { View } from 'react-native';
import { useSchoolPath } from './auth.tsx';
import { useSchoolQuery } from './data.ts';
import { shareFile } from './download.ts';
import { Text } from './text.tsx';
import { colors } from './theme.ts';
import { Badge, Button, Card, T } from './ui.tsx';

/*
 * Genel ayarlar › Okul › Okul yedeği (mobil): ücretli sürümde okulun bütün kayıtları ve görselleri ZIP olarak iner
 * (paylaşım menüsünden "Dosyalara kaydet"). Geri yükleme en ağır işlem olduğu için web panelinden yapılır.
 * Ücretsiz denemede kilitli görünür; yalnızca okul müdürüne görünür.
 */

interface Status {
  allowed: boolean;
  locked: boolean;
  lastBackupAt: string | null;
}

const when = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function BackupCard() {
  const path = useSchoolPath('backup');
  const status = useSchoolQuery<Status>('backup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = status.data;
  if (!s?.allowed) return null;
  const take = async () => {
    setBusy(true);
    setError(null);
    try {
      await shareFile(`${path}.zip`, `Okul yedeği ${new Date().toLocaleDateString('tr-TR')}.zip`, 'application/zip', 'public.zip-archive');
      void status.refetch();
    } catch (e) {
      setError(errorText(e, 'Yedek alınamadı'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>Okul yedeği</Text>
        {s.locked && <Badge tone="warning">🔒 Ücretli sürümde</Badge>}
      </View>
      <T size={13} color={colors.muted}>
        Okulun bütün kayıtları ve görselleri tek dosyada (ZIP) iner. Dosya kişisel veri içerir, güvenli saklayın. Geri yükleme bilgisayardan, web panelinin Genel Ayarlar sayfasından yapılır.
      </T>
      {s.locked ? (
        <Card tone="warning">
          <T size={13}>Yedekleme ücretli sürümde kullanılır. Deneme süresince verileriniz sunucuda her gece yedeklenir.</T>
        </Card>
      ) : (
        s.lastBackupAt && (
          <T size={12} color={colors.faint}>
            Son yedek: {when(s.lastBackupAt)}
          </T>
        )
      )}
      {error && (
        <T size={13} color={colors.danger}>
          {error}
        </T>
      )}
      <Button icon="download-outline" disabled={s.locked} loading={busy} onPress={() => void take()}>
        Yedek al
      </Button>
    </Card>
  );
}
