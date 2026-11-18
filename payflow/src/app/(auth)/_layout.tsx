import { Stack } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';

export const unstable_settings = { initialRouteName: 'login' };

export default function AuthLayout() {
  const { palette } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }} />;
}
