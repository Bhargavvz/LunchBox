import { istDateTime } from '@lunchbox/api-client';
import { Banner, Button, Card, EmptyState, Loading, Screen, Text, useTheme } from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['notifications'], queryFn: () => api.notifications.list(0) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: ['unread'] });
  };
  const markAll = useMutation({ mutationFn: api.notifications.markAllRead, onSuccess: refresh });
  const markOne = useMutation({ mutationFn: api.notifications.markRead, onSuccess: refresh });

  if (list.isLoading) return <Loading />;
  return (
    <Screen>
      <Text variant="title">{t('notifications.title')}</Text>
      {list.error ? <Banner tone="danger">{errorMessage(list.error)}</Banner> : null}
      {list.data?.items.length === 0 ? <EmptyState title={t('notifications.empty')} /> : null}
      {list.data && list.data.items.some((n) => !n.readAt) ? (
        <Button title={t('notifications.markAll')} variant="ghost" onPress={() => markAll.mutate()} />
      ) : null}
      {list.data?.items.map((n) => (
        <Card
          key={n.id}
          onPress={() => {
            if (!n.readAt) markOne.mutate(n.id);
            const orderId = n.data?.['orderId'];
            if (orderId) router.push(`/orders/${orderId}`);
          }}
          style={!n.readAt ? { borderColor: theme.colors.primary, borderWidth: 1 } : undefined}
          accessibilityLabel={n.title}
        >
          <Text variant="label">{n.title}</Text>
          <Text>{n.body}</Text>
          <Text variant="caption" muted>{istDateTime(n.createdAt)}</Text>
        </Card>
      ))}
    </Screen>
  );
}
