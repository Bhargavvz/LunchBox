import { istDate, istDateTime, rupees } from '@lunchbox/api-client';
import { Banner, Button, Divider, Loading, Row, Screen, Text, Wordmark, elevation, useTheme } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Share2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Share, View } from 'react-native';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Row justify="space-between" align="flex-start" gap={4}>
      <Text variant="caption" muted>{label}</Text>
      <Text variant="label" selectable style={{ flex: 1, textAlign: 'right', fontVariant: mono ? ['tabular-nums'] : undefined }}>
        {value}
      </Text>
    </Row>
  );
}

/** A receipt-shaped invoice: torn-paper zigzag at the foot, totals in the display serif. */
export default function InvoiceScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const invoice = useQuery({ queryKey: ['invoice', paymentId], queryFn: () => api.payments.invoice(paymentId) });
  if (invoice.isLoading) return <Loading label={t('common.loading')} />;
  if (invoice.error) {
    return <Screen><Banner tone="danger" title={t('common.problem')}>{errorMessage(invoice.error)}</Banner></Screen>;
  }
  const i = invoice.data!;
  const text = `${i.seller}\n${t('payments.invoice')} ${i.invoiceNumber}\n${istDate(i.issuedAt)}\n${i.billedTo}\n${i.description}: ${rupees(i.amountPaise)}\nRef: ${i.providerPaymentId}`;

  return (
    <Screen footer={<Button title={t('payments.share')} variant="secondary" icon={Share2} size="lg"
                            onPress={() => void Share.share({ message: text })} />}>
      <View style={{ ...elevation(theme, 2) }}>
        <View style={{ backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22, gap: 18 }}>
          <Row justify="space-between" align="flex-start">
            <Wordmark size={20} />
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="overline" muted>{t('payments.invoice')}</Text>
              <Text variant="label" selectable style={{ fontVariant: ['tabular-nums'] }}>{i.invoiceNumber}</Text>
            </View>
          </Row>
          <View style={{ gap: 4 }}>
            <Text variant="overline" muted>{t('payments.amountPaid')}</Text>
            <Text variant="display" style={{ fontVariant: ['tabular-nums'] }}>{rupees(i.amountPaise, { decimals: true })}</Text>
            <Text variant="caption" muted>{istDateTime(i.issuedAt)}</Text>
          </View>
          <Divider />
          <View style={{ gap: 12 }}>
            <Line label={t('payments.billedTo')} value={i.billedTo} />
            <Line label={t('payments.item')} value={i.description} />
            {i.method ? <Line label={t('payments.method')} value={i.method.toUpperCase()} /> : null}
            <Line label={t('payments.reference')} value={i.providerPaymentId} mono />
          </View>
          <Divider />
          <Row justify="space-between">
            <Text variant="bodyStrong">{t('payments.total')}</Text>
            <Text variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{rupees(i.amountPaise, { decimals: true })}</Text>
          </Row>
          <Text variant="caption" tone="faint">{i.seller}</Text>
        </View>
        {/* Zigzag tear: alternating rotated squares in the page colour bite into the bottom edge. */}
        <View style={{ height: 12, backgroundColor: theme.colors.surface, overflow: 'hidden', flexDirection: 'row',
          justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {Array.from({ length: 24 }, (_, k) => (
            <View key={k} style={{ width: 12, height: 12, backgroundColor: theme.colors.background, transform: [{ rotate: '45deg' }],
              marginBottom: -7 }} />
          ))}
        </View>
      </View>
    </Screen>
  );
}
