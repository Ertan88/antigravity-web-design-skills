import { router } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { AppText } from '../ui/primitives';

/**
 * KVKK aydınlatması: verinin toplandığı anda, onay istemeden bilgilendirir.
 * (Aydınlatma metni "okudum, kabul ediyorum" kutusuyla onaylatılmaz.)
 */
export function LegalNotice({ withTerms }: { withTerms?: boolean }) {
  const { palette } = useTheme();
  const link = (label: string, doc: 'kvkk' | 'privacy' | 'terms') => (
    <AppText variant="caption" color={palette.accent} accessibilityRole="link" onPress={() => router.push(`/legal/${doc}`)} style={{ fontFamily: fonts.bodyMedium }}>
      {label}
    </AppText>
  );
  return (
    <AppText variant="caption" muted style={{ lineHeight: 18, textAlign: 'center' }}>
      {withTerms ? <>Devam ederek {link('Kullanım Koşulları', 'terms')}'nı kabul etmiş olursun. </> : null}
      Kişisel verilerinin nasıl işlendiği {link('KVKK Aydınlatma Metni', 'kvkk')} ve {link('Gizlilik Politikası', 'privacy')}'nda açıklanmıştır.
    </AppText>
  );
}
