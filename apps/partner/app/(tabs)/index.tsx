import { istTime, type StopView } from '@lunchbox/api-client';
import { Banner, Button, Card, EmptyState, Loading, Row, Screen, StatusPill, Text, useTheme } from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView } from 'react-native';
import { api } from '../../src/lib/api';
import { currentPosition, startRouteTracking, stopRouteTracking } from '../../src/lib/locationTask';
import { navigateTo } from '../../src/lib/navigation';
import { useActionQueue } from '../../src/lib/offlineQueue';
import { errorMessage } from '../../src/lib/queryClient';

function StopCard({ stop, active }: { stop: StopView; active: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const done = stop.status === 'COMPLETED' || stop.status === 'FAILED' || stop.status === 'SKIPPED';
  return (
    <Card
      onPress={() => router.push(`/stop/${stop.stopId}`)}
      accessibilityLabel={`${stop.sequence}. ${stop.type === 'PICKUP' ? stop.pickup?.parentFirstName : stop.drop?.schoolName}`}
      style={active ? { borderColor: theme.colors.primary, borderWidth: 2 } : done ? { opacity: 0.6 } : undefined}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="label">
          {stop.sequence}. {stop.type === 'PICKUP' ? t('route.pickup') : t('route.drop')}
        </Text>
        <Text variant="caption" muted>{stop.status}</Text>
      </Row>
      {stop.pickup ? (
        <>
          <Text variant="heading">
            {stop.pickup.parentFirstName} · {stop.pickup.childFirstName} ({stop.pickup.className})
          </Text>
          <Text muted numberOfLines={2}>{stop.pickup.address}</Text>
          <Text variant="caption">{t('route.window', { from: istTime(stop.pickup.pickupWindowStart), to: istTime(stop.pickup.pickupWindowEnd) })}</Text>
          <StatusPill status={stop.pickup.orderStatus} />
        </>
      ) : null}
      {stop.drop ? (
        <>
          <Text variant="heading">{stop.drop.schoolName}</Text>
          <Text variant="caption">{t('stop.lunchboxes', { count: stop.drop.orderIds.length })}</Text>
        </>
      ) : null}
      {stop.plannedEta ? <Text variant="caption" muted>{t('route.eta', { time: istTime(stop.plannedEta) })}</Text> : null}
      {active ? (
        <Button title={t('route.navigate')} variant="secondary"
                onPress={() => void navigateTo(stop.location.lat, stop.location.lng)} />
      ) : null}
    </Card>
  );
}

export default function RouteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const pending = useActionQueue((s) => s.items.length);
  const [trackingWarning, setTrackingWarning] = useState(false);
  const me = useQuery({ queryKey: ['partner', 'me'], queryFn: api.partner.me });
  const route = useQuery({ queryKey: ['route'], queryFn: api.partner.todayRoute, refetchInterval: 30_000 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['route'] });
    void qc.invalidateQueries({ queryKey: ['partner', 'me'] });
  };

  const startShift = useMutation({
    mutationFn: async () => api.partner.startShift(await currentPosition()),
    onSuccess: refresh,
  });
  const endShift = useMutation({
    mutationFn: async () => {
      await api.partner.endShift();
      await stopRouteTracking();
    },
    onSuccess: refresh,
  });
  const startRoute = useMutation({
    mutationFn: async () => {
      const r = await api.partner.startRoute();
      setTrackingWarning(!(await startRouteTracking()));
      return r;
    },
    onSuccess: (data) => qc.setQueryData(['route'], data),
  });

  useEffect(() => {
    if (route.data?.status === 'ACTIVE') {
      void startRouteTracking().then((ok) => setTrackingWarning(!ok));
    } else if (route.data?.status === 'COMPLETED') {
      void stopRouteTracking();
    }
  }, [route.data?.status]);

  if (me.isLoading || route.isLoading) return <Loading />;
  const shift = me.data?.todayShift;
  const stops = route.data?.stops ?? [];
  const activeStop = stops.find((s) => s.status === 'PENDING' || s.status === 'ARRIVED');
  const error = me.error ?? route.error ?? startShift.error ?? startRoute.error ?? endShift.error;

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={route.isFetching} onRefresh={refresh} />}>
      <Screen scroll={false}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="title">{t('route.title')}</Text>
          <Button title="SOS" variant="danger" onPress={() => router.push('/issue')} testID="sos" />
        </Row>
        {error ? <Banner tone="danger">{errorMessage(error)}</Banner> : null}
        {pending > 0 ? <Banner tone="warning">{t('profile.pendingSync', { count: pending })}</Banner> : null}
        {trackingWarning ? <Banner tone="warning">{t('route.trackingDenied')}</Banner> : null}

        {!shift ? <Banner tone="info">{t('shift.none')}</Banner> : null}
        {shift?.status === 'SCHEDULED' ? (
          <Button title={t('shift.start')} onPress={() => startShift.mutate()} loading={startShift.isPending} testID="start-shift" />
        ) : null}
        {shift?.status === 'ACTIVE' && shift.startedAt ? (
          <Text muted>{t('shift.active', { time: istTime(shift.startedAt) })}</Text>
        ) : null}

        {route.data?.routeId ? (
          <Text muted>
            {t('route.distance', {
              km: (route.data.totalDistanceM / 1000).toFixed(1),
              minutes: Math.round(route.data.totalDurationS / 60),
            })}
          </Text>
        ) : null}
        {route.data?.status === 'PLANNED' && shift?.status === 'ACTIVE' ? (
          <Button title={t('route.start')} onPress={() => startRoute.mutate()} loading={startRoute.isPending} testID="start-route" />
        ) : null}
        {route.data?.status === 'COMPLETED' ? <Banner tone="success">{t('route.completed')}</Banner> : null}

        {stops.length === 0 ? <EmptyState title={t('route.empty')} /> : null}
        {stops.map((s) => (
          <StopCard key={s.stopId} stop={s} active={route.data?.status === 'ACTIVE' && s.stopId === activeStop?.stopId} />
        ))}

        {shift?.status === 'ACTIVE' && (route.data?.status === 'COMPLETED' || stops.length === 0) ? (
          <Button title={t('shift.end')} variant="ghost" onPress={() => endShift.mutate()} loading={endShift.isPending} />
        ) : null}
      </Screen>
    </ScrollView>
  );
}
