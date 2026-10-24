import { addDays, istDate, rupees, todayIst, type PlanResponse } from '@lunchbox/api-client';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Icon,
  Loading,
  PressableScale,
  Row,
  Screen,
  SectionHeader,
  Text,
  TiffinArt,
  haptic,
  useTheme,
} from '@lunchbox/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, CircleCheck, Lock, MapPin, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { api } from '../../src/lib/api';
import { config } from '../../src/lib/config';
import { errorMessage } from '../../src/lib/queryClient';

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
type Weekday = (typeof WEEKDAYS)[number];
const WEEKS: Record<PlanResponse['billingPeriod'], number> = { MONTHLY: 52 / 12, QUARTERLY: 13 };

/** Approximate price of one lunch for the chosen number of pickup days, for comparing plans honestly. */
function perLunchPaise(plan: PlanResponse, daysPerWeek: number): number {
  const days = Math.max(1, Math.min(daysPerWeek, plan.maxDaysPerWeek));
  return Math.round(plan.pricePaise / (days * WEEKS[plan.billingPeriod]));
}

function Radio({ on }: { on: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 0 : 1.5, borderColor: theme.colors.borderStrong,
      backgroundColor: on ? theme.colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {on ? <Check size={14} color={theme.colors.onPrimary} strokeWidth={3} /> : null}
    </View>
  );
}

export default function SubscribeScreen() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const theme = useTheme();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const child = useQuery({ queryKey: ['child', childId], queryFn: () => api.children.get(childId) });
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

  if (plans.isLoading || addresses.isLoading) return <Loading label={t('common.loading')} />;
  const activePlans = (plans.data ?? []).filter((p) => p.active);
  const plan = activePlans.find((p) => p.id === planId) ?? null;
  const effectiveAddress = addressId ?? addresses.data?.find((a) => a.isDefault)?.id ?? addresses.data?.[0]?.id ?? null;
  const bestValue = activePlans.length > 1
    ? activePlans.reduce((best, p) => (perLunchPaise(p, days.length) < perLunchPaise(best, days.length) ? p : best)).id
    : null;
  const tooManyDays = !!plan && days.length > plan.maxDaysPerWeek;
  const childName = child.data?.firstName ?? '';
  const dayTile = (d: string) => {
    const date = new Date(`${d}T12:00:00+05:30`);
    return {
      weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(date),
      day: new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'Asia/Kolkata' }).format(date),
      month: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'Asia/Kolkata' }).format(date),
    };
  };

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
      haptic.success();
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen footer={<Button title={t('common.done')} size="lg" onPress={() => router.replace('/(tabs)')} />}>
        <View style={{ alignItems: 'center', gap: 16, paddingTop: 48 }}>
          <View>
            <TiffinArt size={120} steam />
            <View style={{ position: 'absolute', right: -6, bottom: 4, borderRadius: 20, backgroundColor: theme.colors.background, padding: 3 }}>
              <CircleCheck size={34} color={theme.colors.surface} fill={theme.colors.primary} />
            </View>
          </View>
          <Text variant="display" center>{t('subscribe.allSet')}</Text>
          <Text muted center style={{ maxWidth: 300 }}>{t('subscribe.success', { date: istDate(startDate) })}</Text>
        </View>
        {plan ? (
          <Card tone="sunken" gap={3}>
            <Row justify="space-between"><Text muted>{t('subscribe.summary.plan')}</Text><Text variant="bodyStrong">{plan.name}</Text></Row>
            <Row justify="space-between"><Text muted>{t('subscribe.days')}</Text>
              <Text variant="bodyStrong">{WEEKDAYS.filter((d) => days.includes(d)).map((d) => t(`days.${d}`)).join(', ')}</Text></Row>
            <Row justify="space-between"><Text muted>{t('subscribe.startDate')}</Text><Text variant="bodyStrong">{istDate(startDate)}</Text></Row>
          </Card>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          {plan ? (
            <Row justify="space-between">
              <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
                {t('subscribe.footerSummary', { plan: plan.name, count: days.length, date: istDate(startDate) })}
              </Text>
              <Row gap={1}>
                <Lock size={12} color={theme.colors.textFaint} />
                <Text variant="caption" tone="faint">Razorpay</Text>
              </Row>
            </Row>
          ) : null}
          <Button
            title={plan ? t('subscribe.pay', { amount: rupees(plan.pricePaise) }) : t('subscribe.choosePlanFirst')}
            size="lg"
            onPress={pay}
            loading={busy}
            disabled={!plan || !effectiveAddress || days.length === 0 || tooManyDays}
            testID="subscribe-pay"
          />
        </>
      }
    >
      {childName ? (
        <Row gap={3}>
          <Avatar name={[child.data?.firstName, child.data?.lastName].filter(Boolean).join(' ')} size={48} />
          <View style={{ flex: 1 }}>
            <Text variant="overline" muted>{t('subscribe.for')}</Text>
            <Text variant="heading">{childName} · {child.data?.schoolName}</Text>
          </View>
        </Row>
      ) : null}
      {error ? <Banner tone="danger" title={t('common.problem')}>{error}</Banner> : null}

      <SectionHeader title={t('subscribe.planStep')} />
      {activePlans.map((p) => {
        const on = planId === p.id;
        return (
          <Card key={p.id} tone="raised" selected={on} onPress={() => { haptic.tap(); setPlanId(p.id); }}
                accessibilityLabel={`${p.name}, ${rupees(p.pricePaise)}`}>
            <Row gap={3} align="flex-start">
              <Radio on={on} />
              <View style={{ flex: 1, gap: 4 }}>
                <Row justify="space-between" align="flex-start">
                  <Text variant="heading" style={{ flex: 1 }}>{p.name}</Text>
                  {bestValue === p.id ? <Badge label={t('subscribe.bestValue')} tone="accent" /> : null}
                </Row>
                <Row gap={1} align="flex-end">
                  <Text variant="numeral">{rupees(p.pricePaise)}</Text>
                  <Text variant="caption" muted style={{ paddingBottom: 4 }}>
                    / {t(p.billingPeriod === 'MONTHLY' ? 'subscribe.month' : 'subscribe.quarter')}
                  </Text>
                </Row>
                <Text variant="caption" muted>
                  {t('subscribe.perLunch', { price: rupees(perLunchPaise(p, days.length)) })} · {t('subscribe.maxDays', { count: p.maxDaysPerWeek })}
                </Text>
                {p.description ? <Text variant="caption" muted>{p.description}</Text> : null}
              </View>
            </Row>
          </Card>
        );
      })}

      <SectionHeader title={t('subscribe.days')}
                     action={<Text variant="caption" muted>{t('subscribe.daysCount', { count: days.length })}</Text>} />
      <Row gap={2}>
        {WEEKDAYS.map((d) => {
          const on = days.includes(d);
          return (
            <PressableScale key={d} style={{ flex: 1 }} scaleTo={0.92} accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }} accessibilityLabel={t(`days.${d}`)}
                            onPress={() => { haptic.tap(); setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d])); }}>
              <View style={{ paddingVertical: 14, alignItems: 'center', borderRadius: theme.radius.md, borderWidth: on ? 0 : 1,
                borderColor: theme.colors.border, backgroundColor: on ? theme.colors.primary : theme.colors.surface }}>
                <Text variant="label" style={{ color: on ? theme.colors.onPrimary : theme.colors.textMuted }}>{t(`days.${d}`)}</Text>
              </View>
            </PressableScale>
          );
        })}
      </Row>
      {tooManyDays ? <Banner tone="warning">{t('subscribe.tooManyDays', { count: plan!.maxDaysPerWeek })}</Banner> : null}

      <SectionHeader title={t('subscribe.address')} />
      {addresses.data?.map((a) => {
        const on = effectiveAddress === a.id;
        return (
          <Card key={a.id} selected={on} onPress={() => { haptic.tap(); setAddressId(a.id); }} accessibilityLabel={`${a.label}, ${a.line1}`}>
            <Row gap={3}>
              <Radio on={on} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{a.label}</Text>
                <Text variant="caption" muted numberOfLines={1}>{a.line1}{a.line2 ? `, ${a.line2}` : ''} · {a.pincode}</Text>
              </View>
              <Icon as={MapPin} size={18} color="textFaint" />
            </Row>
          </Card>
        );
      })}
      <Button title={t('address.add')} variant="outline" icon={Plus} onPress={() => router.push('/addresses/new')} />

      <SectionHeader title={t('subscribe.startDate')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {startOptions.map((d) => {
          const on = startDate === d;
          const tile = dayTile(d);
          return (
            <PressableScale key={d} scaleTo={0.94} accessibilityRole="radio" accessibilityState={{ selected: on }}
                            accessibilityLabel={istDate(d)} onPress={() => { haptic.tap(); setStartDate(d); }}>
              <View style={{ width: 64, paddingVertical: 12, alignItems: 'center', gap: 2, borderRadius: theme.radius.md,
                borderWidth: on ? 2 : 1, borderColor: on ? theme.colors.primary : theme.colors.border,
                backgroundColor: on ? theme.colors.primarySoft : theme.colors.surface }}>
                <Text variant="caption" muted>{tile.weekday}</Text>
                <Text variant="numeral" style={{ fontSize: 24, lineHeight: 30, color: on ? theme.colors.onPrimarySoft : theme.colors.text }}>
                  {tile.day}
                </Text>
                <Text variant="caption" muted>{tile.month}</Text>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
