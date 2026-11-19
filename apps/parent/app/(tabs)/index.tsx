import { IST, istTime, istTimeRange, type OrderResponse } from '@lunchbox/api-client';
import {
  Avatar,
  Banner,
  BoxMark,
  Button,
  Card,
  EmptyState,
  Icon,
  JourneyRail,
  Loading,
  PageTitle,
  PressableScale,
  Row,
  Screen,
  StatusPill,
  Text,
  TiffinArt,
  isLive,
  useTheme,
  type LucideIcon,
} from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CalendarDays, Check, CircleCheck, Clock3, Navigation, QrCode, School } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PickupCode } from '../../src/components/PickupCode';
import { useStatusLabels } from '../../src/hooks/useStatusLabels';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';
import { useSession } from '../../src/lib/session';

const CODE_STATUSES = new Set(['ASSIGNED', 'REASSIGNED', 'PARTNER_EN_ROUTE', 'SCHEDULED']);
const TRACKABLE = new Set(['PARTNER_EN_ROUTE', 'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL', 'DELIVERED']);

function istHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: IST }).format(now),
  );
}

/** One timing fact: icon and label above, the time itself in the display face so it can be read at a glance. */
function TimeFact({
  icon,
  label,
  value,
  grow = 1,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  grow?: number;
}) {
  return (
    <View style={{ flex: grow, gap: 2 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Row gap={1.5}>
        <Icon as={icon} size={15} color="textMuted" />
        <Text variant="caption" muted>
          {label}
        </Text>
      </Row>
      <Text
        variant="numeral"
        numberOfLines={1}
        style={{ fontVariant: ['tabular-nums'], fontSize: 20, lineHeight: 27 }}
      >
        {value}
      </Text>
    </View>
  );
}

function OrderCard({ order }: { order: OrderResponse }) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const labels = useStatusLabels();
  const [showCode, setShowCode] = useState(false);
  const live = isLive(order.status);
  const delivered = order.status === 'DELIVERED';
  const codeable = CODE_STATUSES.has(order.status);

  return (
    <Card tone="raised" padding={0} accessibilityLabel={`${order.childName}: ${labels[order.status]}`}>
      <View style={{ padding: 18, gap: 18 }}>
        <Row gap={3} align="flex-start">
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="heading" numberOfLines={1}>
              {order.childName}
            </Text>
            <Text variant="caption" muted numberOfLines={1} style={{ marginTop: -4 }}>
              {order.schoolName}
            </Text>
            <StatusPill status={order.status} labels={labels} />
          </View>
          {order.boxCode ? (
            <BoxMark code={order.boxCode} size="md" />
          ) : (
            <Avatar name={order.childName ?? ''} size={46} />
          )}
        </Row>

        <JourneyRail
          status={order.status}
          labels={{ home: t('today.rail.home'), road: t('today.rail.road'), school: t('today.rail.school') }}
        />

        {delivered ? (
          <Row
            gap={2}
            style={{ backgroundColor: theme.colors.successSoft, borderRadius: theme.radius.md, padding: 12 }}
          >
            <Icon as={CircleCheck} size={18} color="onSuccessSoft" />
            <Text variant="bodyStrong" style={{ color: theme.colors.onSuccessSoft, flex: 1 }}>
              {t('today.deliveredAt', { time: istTime(order.deliveredAt ?? order.schoolReceivedAt) })}
            </Text>
          </Row>
        ) : (
          <Row
            gap={4}
            align="stretch"
            style={{ paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.border }}
          >
            <TimeFact
              icon={Clock3}
              label={t('today.pickup')}
              grow={1.5}
              value={istTimeRange(order.pickupWindowStart, order.pickupWindowEnd).text}
            />
            <View style={{ width: 1, backgroundColor: theme.colors.border }} />
            <TimeFact icon={School} label={t('today.atSchoolBy')} value={istTime(order.deliveryDeadline)} />
          </Row>
        )}

        {order.failureReason ? <Banner tone="danger">{order.failureReason}</Banner> : null}
        {order.cancelReason ? <Banner tone="warning">{order.cancelReason}</Banner> : null}

        {TRACKABLE.has(order.status) || codeable ? (
          // Stacked, full width: each label stays readable at any text size and in Hindi.
          <View style={{ gap: 10 }}>
            {TRACKABLE.has(order.status) ? (
              <Button
                title={delivered ? t('today.details') : t('today.track')}
                variant={delivered ? 'secondary' : 'primary'}
                icon={delivered ? undefined : Navigation}
                onPress={() => router.push(`/orders/${order.id}`)}
                testID={`track-${order.id}`}
              />
            ) : null}
            {codeable ? (
              <Button
                title={showCode ? t('today.hideCode') : t('today.showCode')}
                variant={live ? 'secondary' : 'primary'}
                icon={QrCode}
                onPress={() => setShowCode((v) => !v)}
                testID={`show-code-${order.id}`}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {showCode && codeable ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <PickupCode orderId={order.id} notchColor={theme.colors.surface} />
        </View>
      ) : null}
    </Card>
  );
}

type StepState = 'done' | 'now' | 'next';

/**
 * Setup as the three tiers of a tiffin filling up: child, then address, then plan. Finished tiers are chalk green with
 * a tick, the one that needs the parent now is turmeric and carries the only button, later ones wait in steel grey.
 * Shown on Today until a plan is paid, so a new account always sees its next step rather than an empty screen.
 */
function SetupChecklist({ hasChild, hasAddress, plan }: {
  hasChild: boolean;
  hasAddress: boolean;
  plan: 'none' | 'pending' | 'active';
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const steps = [
    { key: 'child', done: hasChild, title: t('today.setup.child'), hint: t('today.setup.childHint'),
      action: t('today.setup.addChild'), go: () => router.push('/children/new') },
    { key: 'address', done: hasAddress, title: t('today.setup.address'), hint: t('today.setup.addressHint'),
      action: t('today.setup.addAddress'), go: () => router.push('/addresses/new') },
    { key: 'plan', done: plan === 'active',
      title: plan === 'pending' ? t('today.setup.planPending') : t('today.setup.plan'),
      hint: plan === 'pending' ? t('today.setup.planPendingHint') : t('today.setup.planHint'),
      action: plan === 'pending' ? t('today.setup.finishPayment') : t('today.setup.choosePlan'),
      go: () => router.push('/plans') },
  ];
  const current = steps.findIndex((x) => !x.done);
  const doneCount = steps.filter((x) => x.done).length;
  const stateOf = (i: number): StepState => (steps[i]!.done ? 'done' : i === current ? 'now' : 'next');
  const tierColour = { done: theme.colors.primary, now: theme.colors.accent, next: theme.colors.sunken };

  return (
    <Card tone="raised" padding={0} testID="setup-checklist">
      <View style={{ padding: 18, paddingBottom: 6, gap: 2 }}>
        <Text variant="heading" accessibilityRole="header">{t('today.setup.title')}</Text>
        <Text variant="caption" muted>{t('today.setup.progress', { done: doneCount })}</Text>
      </View>
      <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18 }}>
        {steps.map((step, i) => {
          const state = stateOf(i);
          const last = i === steps.length - 1;
          const label = state === 'done' ? `${i + 1}. ${step.title}, ${t('today.setup.done')}` : `${i + 1}. ${step.title}`;
          return (
            <Row key={step.key} gap={3.5} align="stretch">
              {/* The tier, and the clamp joining it to the next one. */}
              <View style={{ alignItems: 'center', width: 44 }} accessible accessibilityLabel={label}>
                <View style={{ width: 44, height: 32, borderRadius: 11, backgroundColor: tierColour[state],
                  borderBottomWidth: 3, borderBottomColor: state === 'next' ? theme.colors.border : 'rgba(0,0,0,0.18)',
                  alignItems: 'center', justifyContent: 'center' }}>
                  {state === 'done' ? (
                    <Check size={18} color={theme.colors.onPrimary} strokeWidth={3} />
                  ) : (
                    <Text variant="numeral" style={{ fontSize: 19, lineHeight: 22,
                      color: state === 'now' ? theme.colors.onAccent : theme.colors.textFaint }}>
                      {i + 1}
                    </Text>
                  )}
                </View>
                {last ? null : (
                  <View style={{ flex: 1, minHeight: 14, width: 4, borderRadius: 2,
                    backgroundColor: state === 'done' ? theme.colors.primary : theme.colors.border }} />
                )}
              </View>
              <View style={{ flex: 1, gap: 4, paddingTop: 4, paddingBottom: last ? 0 : 18 }}>
                <Text variant="subheading" style={state === 'done' ? { color: theme.colors.textMuted } : undefined}>
                  {step.title}
                </Text>
                {state === 'done' ? (
                  <Text variant="caption" style={{ color: theme.colors.success }}>{t('today.setup.done')}</Text>
                ) : null}
                {state === 'now' ? (
                  <>
                    <Text variant="caption" muted>{step.hint}</Text>
                    <View style={{ marginTop: 8 }}>
                      <Button title={step.action} variant="accent" onPress={step.go} testID={`setup-${step.key}`} />
                    </View>
                  </>
                ) : null}
              </View>
            </Row>
          );
        })}
      </View>
    </Card>
  );
}

export default function TodayScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const firstName = useSession((s) => s.me?.parent?.firstName ?? '');
  const photoUrl = useSession((s) => s.me?.photoUrl);
  const today = useQuery({
    queryKey: ['orders', 'today'],
    queryFn: api.orders.today,
    refetchInterval: 30_000,
  });
  const children = useQuery({ queryKey: ['children'], queryFn: api.children.list });
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: api.addresses.list });
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: api.subscriptions.list });

  if (today.isLoading || children.isLoading || addresses.isLoading || subs.isLoading) {
    return <Loading safeTop label={t('common.loading')} />;
  }

  const hour = istHour();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const dateLine = new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: IST,
  }).format(new Date());
  const orders = today.data ?? [];
  const moving = orders.filter((o) => isLive(o.status)).length;
  const delivered = orders.filter((o) => o.status === 'DELIVERED').length;
  const subStatuses = (subs.data ?? []).map((x) => x.status);
  const plan = subStatuses.includes('ACTIVE') ? 'active' : subStatuses.includes('PENDING_PAYMENT') ? 'pending' : 'none';
  const hasChild = (children.data ?? []).length > 0;
  const hasAddress = (addresses.data ?? []).length > 0;
  const setupDone = hasChild && hasAddress && plan === 'active';
  const refreshing = today.isRefetching || children.isRefetching || addresses.isRefetching || subs.isRefetching;
  const loadError = today.error ?? children.error ?? addresses.error ?? subs.error;

  return (
    <Screen
      testID="today-screen"
      safeTop
      refreshing={refreshing}
      onRefresh={() => void Promise.all([today.refetch(), children.refetch(), addresses.refetch(), subs.refetch()])}
    >
      <PageTitle
        eyebrow={dateLine}
        title={firstName ? t(`today.greeting.${greeting}`, { name: firstName }) : t('today.title')}
        subtitle={
          orders.length === 0
            ? undefined
            : moving > 0
              ? t('today.summaryMoving', { count: orders.length, moving })
              : delivered === orders.length
                ? t('today.summaryDone', { count: orders.length })
                : t('today.summary', { count: orders.length })
        }
        trailing={
          <PressableScale
            onPress={() => router.push('/(tabs)/account')}
            accessibilityRole="button"
            accessibilityLabel={t('tabs.account')}
          >
            <Avatar name={firstName || 'LunchBox'} size={46} uri={photoUrl} />
          </PressableScale>
        }
      />

      {loadError ? (
        <Banner tone="danger" title={t('common.problem')}>
          {errorMessage(loadError)}
        </Banner>
      ) : null}

      {today.data && orders.length === 0 && !setupDone ? (
        <SetupChecklist hasChild={hasChild} hasAddress={hasAddress} plan={plan} />
      ) : null}

      {today.data && orders.length === 0 && setupDone ? (
        <EmptyState
          art={<TiffinArt size={70} mood="muted" steam />}
          title={t('today.noneReady')}
          message={t('today.noneReadyHint')}
          action={
            <Button
              title={t('today.openCalendar')}
              variant="outline"
              icon={CalendarDays}
              onPress={() => router.push('/(tabs)/calendar')}
            />
          }
        />
      ) : null}

      {orders.map((o) => (
        <OrderCard key={o.id} order={o} />
      ))}
    </Screen>
  );
}
