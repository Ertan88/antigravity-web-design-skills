import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { AnyIconKey, Icon } from './icons';
import { AppText, Surface } from './primitives';

/** Henüz kodlanmamış ekranlar için geçici yer tutucu. */
export function ComingSoon({ title, step, icon, note }: { title: string; step: string; icon: AnyIconKey; note: string }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: insets.top + 12, paddingHorizontal: 20, gap: 16 }}>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <Surface style={{ padding: 20, gap: 10, alignItems: 'flex-start' }}>
        <Icon name={icon} size={28} color={palette.accent} />
        <AppText variant="bodyStrong">{step}</AppText>
        <AppText variant="body" muted>
          {note}
        </AppText>
      </Surface>
    </View>
  );
}
