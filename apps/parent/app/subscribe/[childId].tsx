import { addDays, istDate, rupees, todayIst } from '@lunchbox/api-client';
import { Banner, Button, Card, Loading, Row, Screen, Text, useTheme } from '@lunchbox/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { api } from '../../src/lib/api';
import { config } from '../../src/lib/config';
import { errorMessage } from '../../src/lib/queryClient';

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
type Weekday = (typeof WEEKDAYS)[number];

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
      }}
    >
      <Text variant="label" style={{ color: selected ? theme.colors.primary : theme.colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function SubscribeScreen() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const theme = useTheme();
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.plans.list });
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: api.addresses.list });
  const [planId, setPlanId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [days, setDays] = useState<Weekday[]>(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']);
  const startOptions = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(todayIst(), i + 1)), []);
  const [startDate, setStartDate] = useState(startOptions[0]!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (plans.isLoading || addresses.isLoading) return <Loading />;
  const plan = plans.data?.find((p) => p.id === planId) ?? null;
  const effectiveAddress = addressId ?? addresses.data?.find((a) => a.isDefault)?.id ?? null;

  async function pay() {
    if (!plan || !effectiveAddress) return;
    setBusy(true);
    setError(null);
    try {
      const checkout = await api.subscriptions.create({
        childId,
        planId: plan.id,
        addressId: effectiveAddress,
        daysOfWeek: days,
        startDate,
      });
      let paymentId: string;
      let signature: string;
      if (config.useFakePayments) {
        const sim = await api.subscriptions.devSimulateCharge(checkout.providerSubscriptionId, checkout.amountPaise);
        paymentId = sim.razorpayPaymentId;
        signature = sim.razorpaySignature;
      } else {
        const result = await RazorpayCheckout.open({
          key: checkout.razorpayKeyId,
          subscription_id: checkout.providerSubscriptionId,
          name: 'LunchBox',
          description: checkout.planName,
          prefill: { name: checkout.prefillName ?? '', contact: checkout.prefillContact ?? '' },
          theme: { color: theme.colors.primary },
        } as never);
        paymentId = result.razorpay_payment_id;
        signature = result.razorpay_signature;
      }
      await api.subscriptions.verify(checkout.subscriptionId, { razorpayPaymentId: paymentId, razorpaySignature: signature });
      await qc.invalidateQueries({ queryKey: ['subscriptions'] });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <Banner tone="success">{t('subscribe.success', { date: istDate(startDate) })}</Banner>
        <Button title={t('common.done')} onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );
  }

  return (
    <Screen>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Text variant="heading">{t('subscribe.title')}</Text>
      {plans.data?.map((p) => (
        <Card key={p.id} onPress={() => setPlanId(p.id)} accessibilityLabel={p.name}
              style={{ borderColor: planId === p.id ? theme.colors.primary : theme.colors.border, borderWidth: planId === p.id ? 2 : 1 }}>
          <Text variant="heading">{p.name}</Text>
          <Text>{t('subscribe.perPeriod', { price: rupees(p.pricePaise), period: p.billingPeriod === 'MONTHLY' ? 'month' : 'quarter' })}</Text>
          <Text variant="caption" muted>{t('subscribe.maxDays', { count: p.maxDaysPerWeek })}</Text>
          {p.description ? <Text muted>{p.description}</Text> : null}
        </Card>
      ))}

      <Text variant="heading">{t('subscribe.days')}</Text>
      <Row style={{ flexWrap: 'wrap' }}>
        {WEEKDAYS.map((d) => (
          <Chip key={d} label={t(`days.${d}`)} selected={days.includes(d)}
                onPress={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))} />
        ))}
      </Row>
      {plan && days.length > plan.maxDaysPerWeek ? (
        <Banner tone="warning">{t('subscribe.maxDays', { count: plan.maxDaysPerWeek })}</Banner>
      ) : null}

      <Text variant="heading">{t('subscribe.address')}</Text>
      {addresses.data?.map((a) => (
        <Chip key={a.id} label={`${a.label} · ${a.line1}`} selected={effectiveAddress === a.id} onPress={() => setAddressId(a.id)} />
      ))}
      <Button title={t('address.add')} variant="ghost" onPress={() => router.push('/addresses/new')} />

      <Text variant="heading">{t('subscribe.startDate')}</Text>
      <Row style={{ flexWrap: 'wrap' }}>
        {startOptions.map((d) => (
          <Chip key={d} label={istDate(d)} selected={startDate === d} onPress={() => setStartDate(d)} />
        ))}
      </Row>

      <Button
        title={plan ? t('subscribe.pay', { amount: rupees(plan.pricePaise) }) : t('subscribe.title')}
        onPress={pay}
        loading={busy}
        disabled={!plan || !effectiveAddress || days.length === 0 || days.length > plan.maxDaysPerWeek}
        testID="subscribe-pay"
      />
    </Screen>
  );
}
