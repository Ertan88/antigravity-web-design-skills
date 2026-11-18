import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { AnyIconKey, Icon } from './icons';
import { AppText } from './primitives';

const TABS: Record<string, { label: string; icon: AnyIconKey }> = {
  index: { label: 'Ana Sayfa', icon: 'home' },
  timeline: { label: 'Akış', icon: 'calendar' },
  cards: { label: 'Kartlar', icon: 'card' },
  reports: { label: 'Rapor', icon: 'chart' },
};

/**
 * Tasarımdaki alt menü: 4 sekme + ortada yükseltilmiş "Hızlı ekle" butonu.
 * Orta buton bir sekme değil; /add ekranını modal olarak açar.
 */
export function PayFlowTabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const { palette } = useTheme();
  const routes = state.routes.filter((r) => TABS[r.name]);

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-start',
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 12),
        backgroundColor: palette.surface,
        borderTopColor: palette.line,
        borderTopWidth: 1,
      }}
    >
      {routes.map((route, i) => {
        const cfg = TABS[route.name];
        const focused = state.routes[state.index]?.key === route.key;
        const color = focused ? palette.accent : palette.muted;
        return (
          <Fragment key={route.key}>
            {i === 2 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hızlı ekle"
                onPress={() => router.push('/add')}
                style={({ pressed }) => ({
                  width: 58,
                  height: 58,
                  marginTop: -28,
                  borderRadius: 20,
                  backgroundColor: palette.button,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: palette.button,
                  shadowOpacity: 0.35,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 8,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                })}
              >
                <Icon name="plus" size={26} color={palette.onButton} strokeWidth={2.4} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={cfg.label}
              onPress={() => navigateToTab(route.key)}
              style={{ width: 64, alignItems: 'center', gap: 4 }}
            >
              <Icon name={cfg.icon} size={22} color={color} />
              <AppText variant="caption" color={color} style={{ fontFamily: fonts.bodyMedium, fontSize: 11 }}>
                {cfg.label}
              </AppText>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}
