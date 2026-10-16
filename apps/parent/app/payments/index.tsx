import { istDate, rupees } from '@lunchbox/api-client';
import { Banner, Card, EmptyState, Loading, Row, Screen, Text } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

export default function PaymentsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const payments = useQuery({ queryKey: ['payments'], queryFn: () => api.payments.list(0) });
  if (payments.isLoading) return <Loading />;
  return (
    <Screen>
      {payments.error ? <Banner tone="danger">{errorMessage(payments.error)}</Banner> : null}
      {payments.data?.items.length === 0 ? <EmptyState title={t('payments.empty')} /> : null}
      {payments.data?.items.map((p) => (
        <Card key={p.id} onPress={p.status === 'CAPTURED' ? () => router.push(`/payments/${p.id}`) : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label">{p.description}</Text>
            <Text variant="heading">{rupees(p.amountPaise)}</Text>
          </Row>
          <Text variant="caption" muted>
            {p.status} · {p.paidAt ? t('payments.paidOn', { date: istDate(p.paidAt) }) : istDate(p.createdAt)}
          </Text>
          {p.failureReason ? <Banner tone="danger">{p.failureReason}</Banner> : null}
        </Card>
      ))}
    </Screen>
  );
}
