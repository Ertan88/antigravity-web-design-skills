import type { Permission } from '@okulpano/shared/permissions';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from './auth.tsx';
import { colors } from './theme.ts';
import { HeaderButton, Icon, SectionTitle, type IconName } from './ui.tsx';

const QUICK: { label: string; icon: IconName; to: string; permission: Permission }[] = [
  { label: 'Duyuru', icon: 'megaphone-outline', to: '/duyuru-yeni', permission: 'announcements.manage' },
  { label: 'Kayan yazı', icon: 'reorder-three-outline', to: '/icerik/ticker?yeni=1', permission: 'ticker.manage' },
  { label: 'Başarı', icon: 'trophy-outline', to: '/icerik/achievements?yeni=1', permission: 'highlights.manage' },
  { label: 'Etkinlik', icon: 'calendar-number-outline', to: '/icerik/events?yeni=1', permission: 'highlights.manage' },
  { label: 'Sınav', icon: 'school-outline', to: '/icerik/exams?yeni=1', permission: 'exams.manage' },
  { label: 'Kitap', icon: 'book-outline', to: '/icerik/books?yeni=1', permission: 'highlights.manage' },
];

/** Hızlı ekle: yetkiye göre içerik türleri; ilki (genelde duyuru) vurgulu. Kalanlar Menü › İçerik'te. */
export function QuickAdd({ max = 6, title = 'Hızlı ekle' }: { max?: number; title?: string }) {
  const { can } = useAuth();
  const items = QUICK.filter((q) => can(q.permission)).slice(0, max);
  if (!items.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle>{title}</SectionTitle>
      {/* Satırlar üçerli: son satırda eksik kalan yerler boş kutuyla doldurulur, düğmeler hep aynı genişlikte */}
      {Array.from({ length: Math.ceil(items.length / 3) }, (_, r) => items.slice(r * 3, r * 3 + 3)).map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((q, j) => {
            const first = r === 0 && j === 0;
            return (
              <Pressable
                key={q.label}
                accessibilityRole="button"
                onPress={() => router.push(q.to as never)}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 78,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: first ? colors.primary : colors.border,
                  backgroundColor: first ? colors.primary : '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  opacity: pressed ? 0.85 : 1,
                  shadowColor: '#0f172a',
                  shadowOpacity: first ? 0.12 : 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: first ? 2 : 1,
                })}
              >
                <Icon name={q.icon} size={22} color={first ? '#fff' : colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: first ? '#fff' : colors.ink }}>{q.label}</Text>
              </Pressable>
            );
          })}
          {Array.from({ length: 3 - row.length }, (_, k) => (
            <View key={`bos${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Sağ üstteki hesap düğmesi: Menü (profil, şifre, çıkış ve rolün diğer ekranları) */
export function MenuButton() {
  return <HeaderButton icon="person-outline" label="Menü" onPress={() => router.push('/profil')} />;
}
