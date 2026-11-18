import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useStore } from '../../store/StoreProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { PayFlowTabBar } from '../../ui/TabBar';

export default function TabsLayout() {
  const { palette } = useTheme();
  const { state } = useStore();
  if (!state.settings.onboardingDone) return <Redirect href="/onboarding" />;
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
