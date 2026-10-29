import type { Permission } from '@okulpano/shared/permissions';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from './text.tsx';
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

/** Yuvarlak hap bağlantılar; ilki koyu (birincil işlem) */
export function ChipLinks({ items }: { items: { label: string; icon: IconName; to: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((q, i) => {
        const first = i === 0;
        return (
          <Pressable
            key={q.to}
            accessibilityRole="button"
            onPress={() => router.push(q.to as never)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              height: 46,
              paddingHorizontal: 16,
              borderRadius: 23,
              borderWidth: 1,
              borderColor: first ? colors.ink : colors.border,
              backgroundColor: first ? colors.ink : pressed ? colors.primarySoft : '#fff',
              opacity: pressed && first ? 0.85 : 1,
            })}
          >
            <Icon name={q.icon} size={18} color={first ? '#fff' : colors.ink} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: first ? '#fff' : colors.ink }}>{q.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Hızlı ekle: yetkiye göre içerik türleri; ilki (genelde duyuru) koyu. Kalanlar Menü › İçerik'te. */
export function QuickAdd({ max = 6, title = 'Hızlı ekle' }: { max?: number; title?: string }) {
  const { can } = useAuth();
  const items = QUICK.filter((q) => can(q.permission)).slice(0, max);
  if (!items.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle>{title}</SectionTitle>
      <ChipLinks items={items} />
    </View>
  );
}

/** Sağ üstteki hesap düğmesi: Menü (profil, şifre, çıkış ve rolün diğer ekranları) */
export function MenuButton() {
  return <HeaderButton icon="person-outline" label="Menü" onPress={() => router.push('/profil')} />;
}
