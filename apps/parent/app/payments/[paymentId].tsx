import { istDate, istDateTime, rupees } from '@lunchbox/api-client';
import { Banner, Button, Divider, Loading, Row, Screen, Text, Wordmark, elevation, useTheme } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Download, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, View } from 'react-native';
import type { InvoiceResponse } from '@lunchbox/api-client';
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

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A plain, printable A5 receipt; generated on the phone so no receipt data leaves the app except to the share sheet. */
type Labels = Record<'invoice' | 'amountPaid' | 'billedTo' | 'item' | 'method' | 'reference' | 'total', string>;

function receiptHtml(i: InvoiceResponse, labels: Labels): string {
  const row = (k: string, v: string) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A5; margin: 18mm; }
    body { font-family: -apple-system, Roboto, 'Noto Sans', sans-serif; color: #16201D; }
    .brand { font-size: 22px; font-weight: 800; color: #1D4F47; } .muted { color: #56625D; font-size: 12px; }
    h1 { font-size: 15px; margin: 18px 0 4px; } .amount { font-size: 28px; font-weight: 700; margin: 4px 0 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; } td { padding: 7px 0; border-bottom: 1px solid #DCE2DF; font-size: 13px; }
    .k { color: #56625D; width: 40%; } .v { text-align: right; } .total td { font-weight: 700; border-bottom: none; font-size: 15px; }
  </style></head><body>
    <div class="brand">LunchBox</div><div class="muted">${esc(i.seller)}</div>
    <h1>${esc(labels.invoice)} ${esc(i.invoiceNumber)}</h1>
    <div class="muted">${esc(istDateTime(i.issuedAt))}</div>
    <div class="amount">${esc(rupees(i.amountPaise, { decimals: true }))}</div><div class="muted">${esc(labels.amountPaid)}</div>
    <table>
      ${row(labels.billedTo, i.billedTo)}${row(labels.item, i.description)}
      ${i.method ? row(labels.method, i.method.toUpperCase()) : ''}${row(labels.reference, i.providerPaymentId)}
      <tr class="total"><td>${esc(labels.total)}</td><td class="v">${esc(rupees(i.amountPaise, { decimals: true }))}</td></tr>
    </table>
  </body></html>`;
}

/** A receipt-shaped invoice: torn-paper zigzag at the foot, totals in the display serif. */
export default function InvoiceScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const invoice = useQuery({ queryKey: ['invoice', paymentId], queryFn: () => api.payments.invoice(paymentId) });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  if (invoice.isLoading) return <Loading label={t('common.loading')} />;
  if (invoice.error) {
    return <Screen><Banner tone="danger" title={t('common.problem')}>{errorMessage(invoice.error)}</Banner></Screen>;
  }
  const i = invoice.data!;
  const text = `${i.seller}\n${t('payments.invoice')} ${i.invoiceNumber}\n${istDate(i.issuedAt)}\n${i.billedTo}\n${i.description}: ${rupees(i.amountPaise)}\nRef: ${i.providerPaymentId}`;

  async function downloadPdf() {
    setSaveError(null);
    setSaving(true);
    try {
      const labels: Labels = {
        invoice: t('payments.invoice'), amountPaid: t('payments.amountPaid'), billedTo: t('payments.billedTo'),
        item: t('payments.item'), method: t('payments.method'), reference: t('payments.reference'), total: t('payments.total'),
      };
      // Loaded on demand: printing is only needed when a receipt is saved.
      const [Print, Sharing] = await Promise.all([import('expo-print'), import('expo-sharing')]);
      const { uri } = await Print.printToFileAsync({ html: receiptHtml(i, labels) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${t('payments.invoice')} ${i.invoiceNumber}` });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen footer={
      <Row gap={2}>
        <View style={{ flex: 1 }}>
          <Button title={t('payments.share')} variant="secondary" icon={Share2} size="lg" onPress={() => void Share.share({ message: text })} />
        </View>
        <View style={{ flex: 1.2 }}>
          <Button title={t('payments.downloadPdf')} icon={Download} size="lg" loading={saving} onPress={() => void downloadPdf()}
                  testID="receipt-pdf" />
        </View>
      </Row>
    }>
      {saveError ? <Banner tone="danger" title={t('common.problem')}>{saveError}</Banner> : null}
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
            <Text variant="figure">{rupees(i.amountPaise, { decimals: true })}</Text>
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
