import { TabBar, type TabBarProps } from '@lunchbox/ui';
import { Tabs } from 'expo-router';
import { IndianRupee, Route, UserRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useActionQueue } from '../../src/lib/offlineQueue';

const ICONS = { index: Route, earnings: IndianRupee, profile: UserRound };

export default function TabsLayout() {
  const { t } = useTranslation();
  const pending = useActionQueue((s) => s.items.length + s.failed.length);
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...(props as unknown as TabBarProps)} icons={ICONS} />}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.route') }} />
      <Tabs.Screen name="earnings" options={{ title: t('tabs.earnings') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarBadge: pending > 0 ? pending : undefined }} />
    </Tabs>
  );
}
