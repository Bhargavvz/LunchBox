import { IST, istTime, type OrderResponse } from '@lunchbox/api-client';
import {
  Avatar,
  Banner,
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
import { CircleCheck, Clock3, Navigation, QrCode, School } from 'lucide-react-native';
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
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: IST }).format(now));
}

function MetaTile({ icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.sunken, borderRadius: theme.radius.md, padding: 12, gap: 4 }}
          accessible accessibilityLabel={`${label}: ${value}`}>
      <Row gap={1.5}>
        <Icon as={icon} size={14} color="textMuted" />
        <Text variant="overline" muted>{label}</Text>
      </Row>
      <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
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
        <Row gap={3}>
          <Avatar name={order.childName ?? ''} size={46} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" numberOfLines={1}>{order.childName}</Text>
            <Text variant="caption" muted numberOfLines={1}>{order.schoolName}</Text>
          </View>
          <StatusPill status={order.status} labels={labels} />
        </Row>

        <JourneyRail
          status={order.status}
          labels={{ home: t('today.rail.home'), road: t('today.rail.road'), school: t('today.rail.school') }}
        />

        {delivered ? (
          <Row gap={2} style={{ backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.md, padding: 12 }}>
            <Icon as={CircleCheck} size={18} color="onPrimarySoft" />
            <Text variant="bodyStrong" style={{ color: theme.colors.onPrimarySoft, flex: 1 }}>
              {t('today.deliveredAt', { time: istTime(order.deliveredAt ?? order.schoolReceivedAt) })}
            </Text>
          </Row>
        ) : (
          <Row gap={2.5} align="stretch">
            <MetaTile icon={Clock3} label={t('today.pickup')}
                      value={`${istTime(order.pickupWindowStart)} – ${istTime(order.pickupWindowEnd)}`} />
            <MetaTile icon={School} label={t('today.atSchoolBy')} value={istTime(order.deliveryDeadline)} />
          </Row>
        )}

        {order.failureReason ? <Banner tone="danger">{order.failureReason}</Banner> : null}
        {order.cancelReason ? <Banner tone="warning">{order.cancelReason}</Banner> : null}

        {TRACKABLE.has(order.status) || codeable ? (
          <Row gap={2.5}>
            {codeable ? (
              <View style={{ flex: 1 }}>
                <Button
                  title={showCode ? t('today.hideCode') : t('today.showCode')}
                  variant={live ? 'secondary' : 'primary'}
                  icon={QrCode}
                  onPress={() => setShowCode((v) => !v)}
                  testID={`show-code-${order.id}`}
                />
              </View>
            ) : null}
            {TRACKABLE.has(order.status) ? (
              <View style={{ flex: 1 }}>
                <Button
                  title={delivered ? t('today.details') : t('today.track')}
                  variant={delivered ? 'secondary' : 'primary'}
                  icon={delivered ? undefined : Navigation}
                  onPress={() => router.push(`/orders/${order.id}`)}
                  testID={`track-${order.id}`}
                />
              </View>
            ) : null}
          </Row>
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

export default function TodayScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const firstName = useSession((s) => s.me?.parent?.firstName ?? '');
  const today = useQuery({ queryKey: ['orders', 'today'], queryFn: api.orders.today, refetchInterval: 30_000 });

  if (today.isLoading) return <Loading safeTop label={t('common.loading')} />;

  const hour = istHour();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const dateLine = new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: IST,
  }).format(new Date());
  const orders = today.data ?? [];
  const moving = orders.filter((o) => isLive(o.status)).length;
  const delivered = orders.filter((o) => o.status === 'DELIVERED').length;

  return (
    <Screen testID="today-screen" safeTop refreshing={today.isRefetching} onRefresh={() => void today.refetch()}>
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
          <PressableScale onPress={() => router.push('/(tabs)/account')} accessibilityRole="button"
                          accessibilityLabel={t('tabs.account')}>
            <Avatar name={firstName || 'LunchBox'} size={42} />
          </PressableScale>
        }
      />

      {today.error ? <Banner tone="danger" title={t('common.problem')}>{errorMessage(today.error)}</Banner> : null}

      {today.data && orders.length === 0 ? (
        <Card tone="sunken">
          <EmptyState
            art={<TiffinArt size={92} mood="muted" steam />}
            title={t('today.none')}
            message={t('today.noneHint')}
            action={<Button title={t('today.manageChildren')} variant="outline" onPress={() => router.push('/(tabs)/children')} />}
          />
        </Card>
      ) : null}

      {orders.map((o) => <OrderCard key={o.id} order={o} />)}
    </Screen>
  );
}
