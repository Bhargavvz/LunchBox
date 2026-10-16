import { useTheme } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '../../src/lib/api';

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const unread = useQuery({ queryKey: ['unread'], queryFn: api.notifications.unreadCount, refetchInterval: 60_000 });
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: theme.colors.primary, headerTitleAlign: 'left' }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.today'), tabBarAccessibilityLabel: t('tabs.today') }} />
      <Tabs.Screen name="children" options={{ title: t('tabs.children') }} />
      <Tabs.Screen name="calendar" options={{ title: t('tabs.calendar') }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('tabs.alerts'),
          tabBarBadge: unread.data && unread.data.unread > 0 ? unread.data.unread : undefined,
        }}
      />
      <Tabs.Screen name="account" options={{ title: t('tabs.account') }} />
    </Tabs>
  );
}
