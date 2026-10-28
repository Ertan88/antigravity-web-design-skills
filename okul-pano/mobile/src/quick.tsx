import type { Permission } from '@okulpano/shared/permissions';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from './auth.tsx';
import { colors } from './theme.ts';
import { Icon, SectionTitle, type IconName } from './ui.tsx';

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
    <View style={{ gap: 8 }}>
      <SectionTitle>{title}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {items.map((q, i) => (
          <Pressable
            key={q.label}
            accessibilityRole="button"
            onPress={() => router.push(q.to as never)}
            style={({ pressed }) => ({
              width: '31.8%',
              height: 72,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: i === 0 ? colors.primary : colors.border,
              backgroundColor: i === 0 ? colors.primary : '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Icon name={q.icon} size={21} color={i === 0 ? '#fff' : colors.primary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: i === 0 ? '#fff' : colors.ink }}>{q.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Sağ üstteki hesap düğmesi: Menü (profil, şifre, çıkış ve rolün diğer ekranları) */
export function MenuButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Menü"
      onPress={() => router.push('/profil')}
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#dbe3e8',
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="person-outline" size={22} />
    </Pressable>
  );
}
