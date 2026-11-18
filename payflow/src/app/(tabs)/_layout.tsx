import { Tabs } from 'expo-router/js-tabs';
import { useTheme } from '../../theme/ThemeProvider';
import { PayFlowTabBar } from '../../ui/TabBar';

export default function TabsLayout() {
  const { palette } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <PayFlowTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="timeline" />
      <Tabs.Screen name="cards" />
      <Tabs.Screen name="reports" />
    </Tabs>
  );
}
