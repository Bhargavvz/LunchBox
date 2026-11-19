import { istDate, rupees, type SubscriptionResponse } from '@lunchbox/api-client';
import { Banner, Button, Text, useTheme, useToast } from '@lunchbox/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '../lib/api';
import { payAndVerify } from '../lib/checkout';
import { errorMessage } from '../lib/queryClient';

const RENEW_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** The last paid day: a prepaid period ends at IST midnight, so the day before. */
export function lastPaidDay(periodEnd: string): string {
  return istDate(new Date(new Date(periodEnd).getTime() - 60_000).toISOString());
}

/**
 * Prepaid plans (ADR-0018): what the parent can do about payment. Renew in the last 7 days or after the plan lapsed;
 * finish a first payment that was abandoned. Auto-debit plans (no period end on the client) show nothing.
 */
export function PlanPayment({ sub }: { sub: SubscriptionResponse }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const renew = useMutation({
    mutationFn: async () => payAndVerify(await api.subscriptions.renew(sub.id), theme.colors.primary),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['subscriptions'] });
      const fresh = qc.getQueryData<SubscriptionResponse[]>(['subscriptions'])?.find((s) => s.id === sub.id);
      toast(fresh?.currentPeriodEnd ? t('children.renewed', { date: lastPaidDay(fresh.currentPeriodEnd) }) : t('common.done'));
    },
  });
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null;
  const price = rupees(sub.pricePaise);
  const endingSoon = sub.status === 'ACTIVE' && end !== null && end - Date.now() <= RENEW_WINDOW_MS;
  const lapsed = sub.status === 'HALTED';
  const unpaid = sub.status === 'PENDING_PAYMENT';
  return (
    <View style={{ gap: 8 }}>
      {sub.status === 'ACTIVE' && end !== null && !endingSoon ? (
        <Text variant="caption" muted>{t('children.paidUntil', { date: lastPaidDay(sub.currentPeriodEnd!) })}</Text>
      ) : null}
      {endingSoon ? <Banner tone="warning">{t('children.endsSoon', { date: lastPaidDay(sub.currentPeriodEnd!) })}</Banner> : null}
      {lapsed ? <Banner tone="danger">{t('children.ended')}</Banner> : null}
      {endingSoon || lapsed || unpaid ? (
        <Button
          title={unpaid ? t('children.finishPayment', { price }) : t('children.renew', { price })}
          variant={lapsed || unpaid ? 'primary' : 'secondary'}
          icon={RefreshCw}
          loading={renew.isPending}
          onPress={() => renew.mutate()}
          testID={`renew-${sub.id}`}
        />
      ) : null}
      {renew.error ? <Banner tone="danger">{errorMessage(renew.error)}</Banner> : null}
    </View>
  );
}

