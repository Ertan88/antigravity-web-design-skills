import { router } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { AppText } from '../ui/primitives';

/**
 * Bulut (hesap) modu açıldığında giriş/kayıt ekranındaki bilgilendirme. Aydınlatma onaylatılmaz;
 * bulut açılırsa ayrı bir KVKK aydınlatma metni yeniden eklenmelidir (legal/README.md).
 */
export function LegalNotice({ withTerms }: { withTerms?: boolean }) {
  const { palette } = useTheme();
  const link = (label: string, doc: 'privacy' | 'terms') => (
    <AppText variant="caption" color={palette.accent} accessibilityRole="link" onPress={() => router.push(`/legal/${doc}`)} style={{ fontFamily: fonts.bodyMedium }}>
      {label}
    </AppText>
  );
  return (
    <AppText variant="caption" muted style={{ lineHeight: 18, textAlign: 'center' }}>
      {withTerms ? <>Devam ederek {link('Kullanım Koşulları', 'terms')}'nı kabul etmiş olursun. </> : null}
      Kişisel verilerinin nasıl işlendiği {link('Gizlilik Politikası', 'privacy')}'nda açıklanmıştır.
    </AppText>
  );
}
