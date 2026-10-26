import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../src/auth.tsx';
import { useControlCenter } from '../../src/data.ts';
import { colors } from '../../src/theme.ts';
import { Icon, type IconName } from '../../src/ui.tsx';

/**
 * Alt menü role göre değişir. Öğretmen: Bugün · Nöbet · Duyurular · Panolar · Profil.
 * Yönetici: Merkez · Onaylar · Panolar · Nöbet · Acil (profil, merkezin sağ üstünde).
 */
export default function TabsLayout() {
  const { isManager, can } = useAuth();
  const center = useControlCenter(isManager);
  const pending = isManager ? (center.data?.pending.announcements ?? 0) + (center.data?.pending.leaves ?? 0) : 0;
  const showApprovals = isManager && (can('announcements.approve') || can('leaves.manage'));
  const icon = (name: IconName, active: IconName) =>
    function TabIcon({ focused, color }: { focused: boolean; color: unknown }) {
      return <Icon name={focused ? active : name} size={23} color={typeof color === 'string' ? color : colors.muted} />;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { height: 64, paddingTop: 6, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: isManager ? 'Merkez' : 'Bugün', tabBarIcon: isManager ? icon('grid-outline', 'grid') : icon('home-outline', 'home') }} />
      <Tabs.Screen
        name="onaylar"
        options={{ title: 'Onaylar', href: showApprovals ? undefined : null, tabBarIcon: icon('checkmark-done-outline', 'checkmark-done'), tabBarBadge: pending || undefined }}
      />
      <Tabs.Screen name="nobet" options={{ title: 'Nöbet', tabBarIcon: icon('shield-checkmark-outline', 'shield-checkmark') }} />
      <Tabs.Screen name="duyurular" options={{ title: 'Duyurular', href: isManager ? null : undefined, tabBarIcon: icon('megaphone-outline', 'megaphone') }} />
      <Tabs.Screen name="panolar" options={{ title: 'Panolar', tabBarIcon: icon('tv-outline', 'tv') }} />
      <Tabs.Screen
        name="acil"
        options={{
          title: 'Acil',
          href: can('emergency.manage') ? undefined : null,
          // Acil sekmesi her zaman kırmızı (diğer sekmelerin rengini değiştirmeden)
          tabBarIcon: ({ focused }) => <Icon name={focused ? 'warning' : 'warning-outline'} size={23} color={colors.danger} />,
          tabBarLabel: () => <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger }}>Acil</Text>,
        }}
      />
      <Tabs.Screen name="profil" options={{ title: 'Profil', href: isManager ? null : undefined, tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
