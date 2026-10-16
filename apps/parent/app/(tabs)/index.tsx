import { istTime, type OrderResponse } from '@lunchbox/api-client';
import { Banner, Button, Card, EmptyState, Loading, Row, Screen, StatusPill, Text } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView } from 'react-native';
import { PickupCode } from '../../src/components/PickupCode';
import { useStatusLabels } from '../../src/hooks/useStatusLabels';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

const CODE_STATUSES = new Set(['ASSIGNED', 'REASSIGNED', 'PARTNER_EN_ROUTE', 'SCHEDULED']);
const TRACKABLE = new Set(['PARTNER_EN_ROUTE', 'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL', 'DELIVERED']);

function OrderCard({ order }: { order: OrderResponse }) {
  const { t } = useTranslation();
  const router = useRouter();
  const labels = useStatusLabels();
  const [showCode, setShowCode] = useState(false);
  return (
    <Card accessibilityLabel={`${order.childName}: ${labels[order.status]}`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="heading">{order.childName}</Text>
        <StatusPill status={order.status} labels={labels} />
      </Row>
      <Text muted>{order.schoolName}</Text>
      <Text>
        {t('today.pickupWindow', { from: istTime(order.pickupWindowStart), to: istTime(order.pickupWindowEnd) })}
      </Text>
      <Text variant="caption" muted>
        {t('today.deadline', { time: istTime(order.deliveryDeadline) })}
      </Text>
      {order.failureReason ? <Banner tone="danger">{order.failureReason}</Banner> : null}
      {order.cancelReason ? <Banner tone="warning">{order.cancelReason}</Banner> : null}
      {CODE_STATUSES.has(order.status) ? (
        <Button
          title={t('today.showCode')}
          variant="secondary"
          onPress={() => setShowCode((v) => !v)}
          testID={`show-code-${order.id}`}
        />
      ) : null}
      {showCode && CODE_STATUSES.has(order.status) ? <PickupCode orderId={order.id} /> : null}
      {TRACKABLE.has(order.status) ? (
        <Button title={t('today.track')} onPress={() => router.push(`/orders/${order.id}`)} testID={`track-${order.id}`} />
      ) : null}
    </Card>
  );
}

export default function TodayScreen() {
  const { t } = useTranslation();
  const today = useQuery({ queryKey: ['orders', 'today'], queryFn: api.orders.today, refetchInterval: 30_000 });

  if (today.isLoading) return <Loading />;
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={today.isFetching} onRefresh={() => void today.refetch()} />}>
      <Screen scroll={false}>
        <Text variant="title">{t('today.title')}</Text>
        {today.error ? <Banner tone="danger">{errorMessage(today.error)}</Banner> : null}
        {today.data && today.data.length === 0 ? (
          <EmptyState title={t('today.none')} message={t('today.noneHint')} />
        ) : null}
        {today.data?.map((o) => <OrderCard key={o.id} order={o} />)}
      </Screen>
    </ScrollView>
  );
}
