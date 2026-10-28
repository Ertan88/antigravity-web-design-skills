import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, type AppRole } from '../../src/auth.tsx';
import { useControlCenter, useInbox } from '../../src/data.ts';
import { colors } from '../../src/theme.ts';
import { Icon, type IconName } from '../../src/ui.tsx';

type TabName = 'index' | 'onaylar' | 'panolar' | 'nobet' | 'acil' | 'duyurular' | 'izinlerim' | 'okullar' | 'takvim' | 'kutu' | 'profil';

/**
 * Alt menü role göre kurulur (en çok 5 sekme; geri kalanı profil menüsünde):
 * - Platform yöneticisi: Platform · Okullar · Takvim · Bildirimler
 * - Okul sahibi ve yönetici: Merkez · Onaylar · Panolar · Nöbet · Acil
 * - Editör: İçerik + yetkilerinden gelen sekmeler (Duyurular, Onaylar, Panolar, Nöbet, Acil) + Bildirimler
 * - Öğretmen: Bugün · Nöbetim · Duyurular · İzin · Profil
 */
function visibleTabs(role: AppRole, can: (p: Parameters<ReturnType<typeof useAuth>['can']>[0]) => boolean): TabName[] {
  switch (role) {
    case 'platform':
      return ['index', 'okullar', 'takvim', 'kutu'];
    case 'owner':
    case 'admin':
      return ['index', 'onaylar', 'panolar', 'nobet', 'acil'];
    case 'editor': {
      const extra: TabName[] = [];
      if (can('announcements.manage')) extra.push('duyurular');
      if (can('announcements.approve') || can('leaves.manage')) extra.push('onaylar');
      if (can('board.control') || can('screens.manage')) extra.push('panolar');
      if (can('duties.manage')) extra.push('nobet');
      if (can('emergency.manage')) extra.push('acil');
      return ['index', ...extra.slice(0, 3), 'kutu'];
    }
    default:
      return ['index', 'nobet', 'duyurular', 'izinlerim', 'profil'];
  }
}

const HOME_TITLE: Record<AppRole, string> = { platform: 'Platform', owner: 'Merkez', admin: 'Merkez', editor: 'İçerik', teacher: 'Bugün' };
const HOME_ICON: Record<AppRole, [IconName, IconName]> = {
  platform: ['grid-outline', 'grid'],
  owner: ['grid-outline', 'grid'],
  admin: ['grid-outline', 'grid'],
  editor: ['create-outline', 'create'],
  teacher: ['home-outline', 'home'],
};

export default function TabsLayout() {
  const { role, can, isManager } = useAuth();
  // Telefonun alt sistem çubuğu (üç düğmeli gezinme) menünün üstüne binmesin
  const insets = useSafeAreaInsets();
  const center = useControlCenter(isManager && role !== 'platform');
  const inbox = useInbox('unread');
  const pending = (center.data?.pending.announcements ?? 0) + (center.data?.pending.leaves ?? 0);
  const shown = new Set(visibleTabs(role, can));
  // Rolde olmayan sekmenin yalnızca düğmesi gizlenir (href: null rotayı da kapatır; bildirimden ya da Menü'den açılamaz)
  const hide = (name: TabName) => (shown.has(name) ? {} : { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } });
  const icon = (name: IconName, active: IconName) =>
    function TabIcon({ focused, color }: { focused: boolean; color: unknown }) {
      // Seçili sekmede simgenin arkasında hap biçimli gösterge (yalnız renkten daha kolay fark edilir)
      return (
        <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.primarySoft : 'transparent' }}>
          <Icon name={focused ? active : name} size={22} color={typeof color === 'string' ? color : colors.muted} />
        </View>
      );
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
        tabBarStyle: { height: 66 + insets.bottom, paddingTop: 8, paddingBottom: 8 + insets.bottom, borderTopColor: colors.border, backgroundColor: '#fff' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: HOME_TITLE[role], tabBarIcon: icon(...HOME_ICON[role]) }} />
      <Tabs.Screen name="okullar" options={{ title: 'Okullar', ...hide('okullar'), tabBarIcon: icon('business-outline', 'business') }} />
      <Tabs.Screen name="takvim" options={{ title: 'Takvim', ...hide('takvim'), tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen
        name="onaylar"
        options={{ title: 'Onaylar', ...hide('onaylar'), tabBarIcon: icon('checkmark-done-outline', 'checkmark-done'), tabBarBadge: pending || undefined }}
      />
      <Tabs.Screen name="duyurular" options={{ title: 'Duyurular', ...hide('duyurular'), tabBarIcon: icon('megaphone-outline', 'megaphone') }} />
      <Tabs.Screen name="panolar" options={{ title: 'Panolar', ...hide('panolar'), tabBarIcon: icon('tv-outline', 'tv') }} />
      <Tabs.Screen
        name="nobet"
        options={{ title: role === 'teacher' ? 'Nöbetim' : 'Nöbet', ...hide('nobet'), tabBarIcon: icon('shield-checkmark-outline', 'shield-checkmark') }}
      />
      <Tabs.Screen name="izinlerim" options={{ title: 'İzin', ...hide('izinlerim'), tabBarIcon: icon('calendar-clear-outline', 'calendar-clear') }} />
      <Tabs.Screen
        name="acil"
        options={{
          title: 'Acil',
          ...hide('acil'),
          // Acil sekmesi her zaman kırmızı (diğer sekmelerin rengini değiştirmeden)
          tabBarIcon: ({ focused }) => (
            <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.dangerSoft : 'transparent' }}>
              <Icon name={focused ? 'warning' : 'warning-outline'} size={22} color={colors.danger} />
            </View>
          ),
          tabBarLabel: () => <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger }}>Acil</Text>,
        }}
      />
      <Tabs.Screen
        name="kutu"
        options={{ title: 'Bildirimler', ...hide('kutu'), tabBarIcon: icon('notifications-outline', 'notifications'), tabBarBadge: inbox.data?.unread || undefined }}
      />
      <Tabs.Screen name="profil" options={{ title: 'Profil', ...hide('profil'), tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
