import { View } from 'react-native';
import { maskEmail } from './accounts.ts';
import { membershipLabel, useAuth } from './auth.tsx';
import { colors } from './theme.ts';
import { Avatar, Badge, Card, T } from './ui.tsx';

/**
 * Hangi hesapta olunduğu (B): Güvenlik ve doğrulama ekranlarının üstünde. Telefonda iki hesabı olan platform
 * yöneticisi hangi hesabın şifresinin istendiğini karıştırmasın diye. E-posta yarı gizli (ekran görüntüsü paylaşılırsa).
 */
export function AccountCard() {
  const { me, school, role } = useAuth();
  if (!me) return null;
  const label = role === 'platform' ? 'Platform' : school ? membershipLabel(school) : null;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Avatar name={me.user.fullName} size={40} />
      <View style={{ flex: 1, gap: 1 }}>
        <T weight="800" lines={1}>
          {me.user.fullName}
        </T>
        <T size={13} color={colors.muted} lines={1}>
          {maskEmail(me.user.email)}
        </T>
      </View>
      {label && <Badge tone={role === 'platform' ? 'primary' : 'muted'}>{label}</Badge>}
    </Card>
  );
}
