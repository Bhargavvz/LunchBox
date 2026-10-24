import { istDate, rupees, type PaymentResponse } from '@lunchbox/api-client';
import {
  Badge,
  Banner,
  EmptyState,
  Icon,
  ListGroup,
  Loading,
  PressableScale,
  Row,
  Screen,
  Text,
  TiffinArt,
  useTheme,
} from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronRight, CreditCard, Landmark, Smartphone, Wallet } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

const TONE = { CREATED: 'neutral', AUTHORIZED: 'info', CAPTURED: 'primary', FAILED: 'danger', REFUNDED: 'accent' } as const;

function methodIcon(method: string | null | undefined) {
  switch ((method ?? '').toLowerCase()) {
    case 'upi':
      return Smartphone;
    case 'card':
      return CreditCard;
    case 'netbanking':
    case 'emandate':
    case 'nach':
      return Landmark;
    default:
      return Wallet;
  }
}

function PaymentRow({ p }: { p: PaymentResponse }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const invoiceable = p.status === 'CAPTURED';
  const body = (
    <Row gap={3.5} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: theme.colors.sunken, alignItems: 'center', justifyContent: 'center' }}>
        <Icon as={methodIcon(p.method)} size={19} color="textMuted" />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="bodyStrong" numberOfLines={1}>{p.description}</Text>
        <Text variant="caption" muted>
          {p.paidAt ? t('payments.paidOn', { date: istDate(p.paidAt) }) : istDate(p.createdAt)}
          {p.method ? ` · ${p.method.toUpperCase()}` : ''}
        </Text>
        {p.failureReason ? <Text variant="caption" tone="danger" numberOfLines={2}>{p.failureReason}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 5 }}>
        <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'],
          textDecorationLine: p.status === 'FAILED' ? 'line-through' : 'none' }}>{rupees(p.amountPaise)}</Text>
        <Badge label={t(`payments.status.${p.status}`)} tone={TONE[p.status]} />
      </View>
      {invoiceable ? <Icon as={ChevronRight} size={18} color="textFaint" /> : null}
    </Row>
  );
  if (!invoiceable) return <View accessible accessibilityLabel={`${p.description}, ${rupees(p.amountPaise)}, ${t(`payments.status.${p.status}`)}`}>{body}</View>;
  return (
    <PressableScale onPress={() => router.push(`/payments/${p.id}`)} scaleTo={0.985} accessibilityRole="button"
                    accessibilityLabel={`${p.description}, ${rupees(p.amountPaise)}`} accessibilityHint={t('payments.openInvoice')}>
      {body}
    </PressableScale>
  );
}

export default function PaymentsScreen() {
  const { t } = useTranslation();
  const payments = useQuery({ queryKey: ['payments'], queryFn: () => api.payments.list(0) });
  if (payments.isLoading) return <Loading label={t('common.loading')} />;
  const items = payments.data?.items ?? [];
  return (
    <Screen refreshing={payments.isRefetching} onRefresh={() => void payments.refetch()}>
      {payments.error ? <Banner tone="danger">{errorMessage(payments.error)}</Banner> : null}
      {payments.data && items.length === 0 ? (
        <EmptyState art={<TiffinArt size={88} mood="muted" />} title={t('payments.empty')} message={t('payments.emptyHint')} />
      ) : null}
      {items.length > 0 ? (
        <ListGroup>
          {items.map((p) => <PaymentRow key={p.id} p={p} />)}
        </ListGroup>
      ) : null}
    </Screen>
  );
}
