import type { LucideIcon } from 'lucide-react-native';
import { Pressable, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from './haptics';
import { Icon } from './icons';
import { useTheme } from './theme';

/** The subset of React Navigation's bottom-tab props the bar needs (structural, so no hard dependency). */
export interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string; tabBarBadge?: number | string; tabBarAccessibilityLabel?: string } }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

/** Bottom tabs: the active icon sits on a chalk-green pill, with a turmeric count badge. Docked, never floating. */
export function TabBar({ state, descriptors, navigation, icons }: TabBarProps & { icons: Record<string, LucideIcon> }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: t.colors.surface,
        borderTopWidth: 1,
        borderTopColor: t.colors.border,
        paddingTop: 0,
        paddingBottom: Math.max(insets.bottom, 10),
        paddingHorizontal: 6,
      }}
    >
      {state.routes.map((route, i) => {
        const options = descriptors[route.key]?.options ?? {};
        const focused = state.index === i;
        const label = options.title ?? route.name;
        const badge = options.tabBarBadge;
        const glyph = icons[route.name];
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            haptic.tap();
            navigation.navigate(route.name);
          }
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={`${options.tabBarAccessibilityLabel ?? label}${badge ? `, ${badge} new` : ''}`}
            testID={`tab-${route.name}`}
            style={{ flex: 1, alignItems: 'center' }}
          >
            {/* Active tab: the icon sits on a soft chalk-green lid, a pill the width of a tiffin. Keyed on focus so
                Android redraws it: recolouring a transparent rounded view in place drops its corner radius. */}
            <View key={focused ? 'on' : 'off'} style={{ height: 32, width: 58, marginTop: 8, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
              backgroundColor: focused ? t.colors.primarySoft : 'transparent' }}>
              {glyph ? (
                <Icon as={glyph} size={23} color={focused ? t.colors.primary : t.colors.textMuted}
                      strokeWidth={focused ? 2.3 : 1.8} />
              ) : null}
              {badge ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    left: 14,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    paddingHorizontal: 4,
                    backgroundColor: t.colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: t.colors.surface,
                  }}
                >
                  <RNText style={{ fontFamily: t.fonts.bold, fontSize: 10.5, lineHeight: 13, color: t.colors.onAccent,
                    includeFontPadding: false }}>
                    {typeof badge === 'number' && badge > 9 ? '9+' : badge}
                  </RNText>
                </View>
              ) : null}
            </View>
            <RNText
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ fontFamily: focused ? t.fonts.bold : t.fonts.medium, fontSize: 12.5, lineHeight: 17, marginTop: 2,
                includeFontPadding: false, color: focused ? t.colors.text : t.colors.textMuted }}
            >
              {label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
