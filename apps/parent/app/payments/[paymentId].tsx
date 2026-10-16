import { istDate, rupees } from '@lunchbox/api-client';
import { Banner, Button, Card, Loading, Row, Screen, Text } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Share } from 'react-native';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

export default function InvoiceScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { t } = useTranslation();
  const invoice = useQuery({ queryKey: ['invoice', paymentId], queryFn: () => api.payments.invoice(paymentId) });
  if (invoice.isLoading) return <Loading />;
  if (invoice.error) return <Banner tone="danger">{errorMessage(invoice.error)}</Banner>;
  const i = invoice.data!;
  const text = `${i.seller}\n${t('payments.invoice')} ${i.invoiceNumber}\n${istDate(i.issuedAt)}\n${i.billedTo}\n${i.description}: ${rupees(i.amountPaise)}\nRef: ${i.providerPaymentId}`;
  return (
    <Screen>
      <Card>
        <Text variant="heading">{i.seller}</Text>
        <Text muted>{t('payments.invoice')} {i.invoiceNumber}</Text>
        <Text>{istDate(i.issuedAt)}</Text>
        <Text>{i.billedTo}</Text>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text>{i.description}</Text>
          <Text variant="heading">{rupees(i.amountPaise)}</Text>
        </Row>
        <Text variant="caption" muted>{i.method ?? ''} · {i.providerPaymentId}</Text>
      </Card>
      <Button title="Share" variant="secondary" onPress={() => void Share.share({ message: text })} />
    </Screen>
  );
}
