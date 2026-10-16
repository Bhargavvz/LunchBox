import { istDate, rupees } from '@lunchbox/api-client';
import { Banner, Card, Loading, Row, Screen, Text, useTheme } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

export default function EarningsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const earnings = useQuery({
    queryKey: ['earnings', mode],
    queryFn: () => (mode === 'week' ? api.partner.earnings() : api.partner.monthlyEarnings()),
  });
  const payouts = useQuery({ queryKey: ['payouts'], queryFn: () => api.partner.payouts(0) });

  if (earnings.isLoading) return <Loading />;
  const data = earnings.data;
  const max = Math.max(1, ...(data?.days.map((d) => d.amountPaise) ?? [1]));

  return (
    <Screen>
      <Text variant="title">{t('earnings.title')}</Text>
      {earnings.error ? <Banner tone="danger">{errorMessage(earnings.error)}</Banner> : null}
      <Row>
        {(['week', 'month'] as const).map((m) => (
          <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => setMode(m)}
                     style={{ padding: 8 }}>
            <Text variant="label" muted={mode !== m}>{m === 'week' ? t('earnings.week') : t('earnings.month')}</Text>
          </Pressable>
        ))}
      </Row>
      {data ? (
        <>
          <Card>
            <Text variant="title">{rupees(data.earnedPaise)}</Text>
            <Text muted>{t('earnings.balance')}: {rupees(data.balancePaise)}</Text>
          </Card>
          <Card accessibilityLabel="Daily earnings chart">
            <Row style={{ alignItems: 'flex-end', height: 120, gap: 4 }}>
              {data.days.map((d) => (
                <View key={d.date} accessibilityLabel={`${istDate(d.date)}: ${rupees(d.amountPaise)}`}
                      style={{ flex: 1, height: Math.max(2, (d.amountPaise / max) * 110), backgroundColor: theme.colors.primary, borderRadius: 3 }} />
              ))}
            </Row>
          </Card>
          <Card>
            {data.entries.slice(0, 50).map((e) => (
              <Row key={e.id} style={{ justifyContent: 'space-between' }}>
                <Text style={{ flex: 1 }}>{istDate(e.earningDate)} · {e.description}</Text>
                <Text variant="label" style={{ color: e.amountPaise < 0 ? theme.colors.danger : theme.colors.text }}>
                  {rupees(e.amountPaise)}
                </Text>
              </Row>
            ))}
          </Card>
        </>
      ) : null}
      <Text variant="heading">{t('earnings.payouts')}</Text>
      {payouts.data?.items.length === 0 ? <Text muted>{t('earnings.noPayouts')}</Text> : null}
      {payouts.data?.items.map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label">{istDate(p.periodStart)} – {istDate(p.periodEnd)}</Text>
            <Text variant="heading">{rupees(p.amountPaise)}</Text>
          </Row>
          <Text variant="caption" muted>{p.status}{p.utr ? ` · UTR ${p.utr}` : ''}</Text>
        </Card>
      ))}
    </Screen>
  );
}
