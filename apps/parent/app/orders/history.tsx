import { istDate } from '@lunchbox/api-client';
import { Banner, Card, EmptyState, Loading, Row, Screen, StatusPill, Text } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStatusLabels } from '../../src/hooks/useStatusLabels';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

export default function OrderHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const labels = useStatusLabels();
  const history = useQuery({ queryKey: ['orders', 'history'], queryFn: () => api.orders.history({ page: 0, size: 60 }) });
  if (history.isLoading) return <Loading />;
  return (
    <Screen>
      {history.error ? <Banner tone="danger">{errorMessage(history.error)}</Banner> : null}
      {history.data?.items.length === 0 ? <EmptyState title={t('today.none')} /> : null}
      {history.data?.items.map((o) => (
        <Card key={o.id} onPress={() => router.push(`/orders/${o.id}`)} accessibilityLabel={`${o.childName} ${istDate(o.scheduledDate)}`}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label">{istDate(o.scheduledDate)} · {o.childName}</Text>
            <StatusPill status={o.status} labels={labels} />
          </Row>
          <Text variant="caption" muted>{o.schoolName}</Text>
        </Card>
      ))}
    </Screen>
  );
}
