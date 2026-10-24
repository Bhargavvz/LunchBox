import { IST, istTime, type StopView } from '@lunchbox/api-client';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Icon,
  LiveDot,
  Loading,
  PageTitle,
  PressableScale,
  Row,
  Screen,
  SectionHeader,
  Stat,
  StatusPill,
  Text,
  TiffinArt,
  haptic,
  useTheme,
} from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Check, ChevronRight, House, Navigation, Play, School, Siren, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '../../src/lib/api';
import { currentPosition, startRouteTracking, stopRouteTracking } from '../../src/lib/locationTask';
import { navigateTo } from '../../src/lib/navigation';
import { useActionQueue } from '../../src/lib/offlineQueue';
import { errorMessage } from '../../src/lib/queryClient';

const DONE = new Set(['COMPLETED', 'FAILED', 'SKIPPED']);

function stopTitle(stop: StopView): string {
  return stop.type === 'PICKUP' ? stop.pickup?.parentFirstName ?? '' : stop.drop?.schoolName ?? '';
}

/** Numbered node on the route rail: a check when done, a cross when it failed, a pulse on the current stop. */
function Node({ stop, current }: { stop: StopView; current: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  if (stop.status === 'COMPLETED') {
    return (
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Check size={16} color={c.onPrimary} strokeWidth={3} />
      </View>
    );
  }
  if (stop.status === 'FAILED' || stop.status === 'SKIPPED') {
    return (
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
        <X size={16} color={c.onDangerSoft} strokeWidth={3} />
      </View>
    );
  }
  return (
    <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: current ? c.primary : c.borderStrong,
      backgroundColor: current ? c.primarySoft : c.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="label" style={{ color: current ? c.onPrimarySoft : c.textMuted, fontVariant: ['tabular-nums'] }}>{stop.sequence}</Text>
    </View>
  );
}

function StopRow({ stop, current, last }: { stop: StopView; current: boolean; last: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const done = DONE.has(stop.status);
  const isPickup = stop.type === 'PICKUP';
  const when = isPickup
    ? t('route.window', { from: istTime(stop.pickup?.pickupWindowStart), to: istTime(stop.pickup?.pickupWindowEnd) })
    : stop.drop?.deadline ? t('route.deadline', { time: istTime(stop.drop.deadline) }) : '';
  return (
    <Row align="stretch" gap={3}>
      <View style={{ alignItems: 'center', width: 30 }}>
        <Node stop={stop} current={current} />
        {!last ? <View style={{ flex: 1, width: 2, marginVertical: 4, borderRadius: 1,
          backgroundColor: done ? theme.colors.primary : theme.colors.border }} /> : null}
      </View>
      <PressableScale
        style={{ flex: 1, marginBottom: last ? 0 : 12 }}
        scaleTo={0.985}
        onPress={() => router.push(`/stop/${stop.stopId}`)}
        accessibilityLabel={`${stop.sequence}. ${isPickup ? t('route.pickup') : t('route.drop')}, ${stopTitle(stop)}`}
        testID={`stop-${stop.sequence}`}
      >
        <View style={{ padding: 14, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1,
          borderColor: current ? theme.colors.primary : theme.colors.border, opacity: done ? 0.62 : 1, gap: 6 }}>
          <Row gap={2}>
            <Icon as={isPickup ? House : School} size={15} color={isPickup ? 'accent' : 'info'} />
            <Text variant="overline" muted style={{ flex: 1 }}>{isPickup ? t('route.pickup') : t('route.drop')}</Text>
            {stop.plannedEta && !done ? (
              <Text variant="caption" muted style={{ fontVariant: ['tabular-nums'] }}>{t('route.eta', { time: istTime(stop.plannedEta) })}</Text>
            ) : null}
            <Icon as={ChevronRight} size={16} color="textFaint" />
          </Row>
          <Text variant="heading" numberOfLines={1}>
            {isPickup ? `${stop.pickup?.parentFirstName} · ${stop.pickup?.childFirstName}` : stop.drop?.schoolName}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>{isPickup ? stop.pickup?.address : stop.drop?.address}</Text>
          <Row justify="space-between">
            <Text variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
              {isPickup ? when : `${t('stop.lunchboxes', { count: stop.drop?.orderIds.length ?? 0 })} · ${when}`}
            </Text>
            {isPickup && stop.pickup ? <StatusPill status={stop.pickup.orderStatus} /> : null}
          </Row>
        </View>
      </PressableScale>
    </Row>
  );
}

export default function RouteScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
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
    onSuccess: () => {
      haptic.success();
      refresh();
    },
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
    onSuccess: (data) => {
      haptic.success();
      qc.setQueryData(['route'], data);
    },
  });

  useEffect(() => {
    if (route.data?.status === 'ACTIVE') {
      void startRouteTracking().then((ok) => setTrackingWarning(!ok));
    } else if (route.data?.status === 'COMPLETED') {
      void stopRouteTracking();
    }
  }, [route.data?.status]);

  if (me.isLoading || route.isLoading) return <Loading safeTop label={t('common.loading')} />;
  const shift = me.data?.todayShift;
  const stops = route.data?.stops ?? [];
  const activeStop = stops.find((s) => s.status === 'PENDING' || s.status === 'ARRIVED');
  const routeActive = route.data?.status === 'ACTIVE';
  const doneCount = stops.filter((s) => DONE.has(s.status)).length;
  const error = me.error ?? route.error ?? startShift.error ?? startRoute.error ?? endShift.error;
  const dateLine = new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: IST,
  }).format(new Date());

  return (
    <Screen safeTop refreshing={route.isRefetching} onRefresh={refresh}>
      <PageTitle
        eyebrow={dateLine}
        title={t('route.title')}
        trailing={
          <PressableScale onPress={() => router.push('/issue')} accessibilityRole="button" accessibilityLabel={t('issue.sos')} testID="sos">
            <Row gap={1.5} style={{ backgroundColor: theme.colors.danger, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 }}>
              <Siren size={16} color={theme.colors.onDanger} strokeWidth={2.4} />
              <Text variant="label" style={{ color: theme.colors.onDanger, letterSpacing: 1 }}>SOS</Text>
            </Row>
          </PressableScale>
        }
      />
      {error ? <Banner tone="danger" title={t('common.problem')}>{errorMessage(error)}</Banner> : null}
      {pending > 0 ? <Banner tone="warning">{t('profile.pendingSync', { count: pending })}</Banner> : null}
      {trackingWarning ? <Banner tone="warning">{t('route.trackingDenied')}</Banner> : null}

      {!shift ? (
        <Card tone="sunken">
          <EmptyState art={<TiffinArt size={80} mood="muted" />} title={t('shift.none')} message={t('shift.noneHint')} />
        </Card>
      ) : (
        <Card tone="brand" gap={4}>
          <Row justify="space-between">
            {shift.status === 'ACTIVE' ? (
              <Row gap={2}>
                <LiveDot color={theme.colors.onPrimary} size={8} />
                <Text variant="label" tone="onPrimary">
                  {shift.startedAt ? t('shift.active', { time: istTime(shift.startedAt) }) : t('shift.onShift')}
                </Text>
              </Row>
            ) : (
              <Text variant="label" tone="onPrimary">
                {t('shift.planned', { from: istTime(shift.plannedStart), to: istTime(shift.plannedEnd) })}
              </Text>
            )}
          </Row>
          {route.data?.routeId ? (
            <Row justify="space-between">
              <Stat label={t('route.stops')} value={`${doneCount}/${stops.length}`} tone="onPrimary" />
              <Stat label={t('route.km')} value={(route.data.totalDistanceM / 1000).toFixed(1)} tone="onPrimary" />
              <Stat label={t('route.minutes')} value={String(Math.round(route.data.totalDurationS / 60))} tone="onPrimary" />
            </Row>
          ) : null}
          {stops.length > 0 ? (
            <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}
                  accessibilityLabel={t('route.progress', { done: doneCount, total: stops.length })}>
              <View style={{ width: `${(doneCount / stops.length) * 100}%`, height: 6, borderRadius: 3, backgroundColor: theme.colors.accent }} />
            </View>
          ) : null}
          {shift.status === 'SCHEDULED' ? (
            <Button title={t('shift.start')} variant="accent" size="lg" icon={Play} onPress={() => startShift.mutate()}
                    loading={startShift.isPending} testID="start-shift" />
          ) : null}
          {route.data?.status === 'PLANNED' && shift.status === 'ACTIVE' ? (
            <Button title={t('route.start')} variant="accent" size="lg" icon={Navigation} onPress={() => startRoute.mutate()}
                    loading={startRoute.isPending} testID="start-route" />
          ) : null}
        </Card>
      )}

      {routeActive && activeStop ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title={t('route.next')} />
          <Card tone="raised" gap={3}>
            <Row gap={2}>
              <Icon as={activeStop.type === 'PICKUP' ? House : School} size={18} color={activeStop.type === 'PICKUP' ? 'accent' : 'info'} />
              <Text variant="overline" muted style={{ flex: 1 }}>
                {activeStop.type === 'PICKUP' ? t('route.pickup') : t('route.drop')} · {t('route.stopOf', { n: activeStop.sequence, total: stops.length })}
              </Text>
            </Row>
            <Text variant="title" numberOfLines={2}>{stopTitle(activeStop)}</Text>
            <Text muted numberOfLines={2}>{activeStop.type === 'PICKUP' ? activeStop.pickup?.address : activeStop.drop?.address}</Text>
            <Row gap={2.5}>
              <View style={{ flex: 1 }}>
                <Button title={t('route.navigate')} icon={Navigation} size="lg"
                        onPress={() => void navigateTo(activeStop.location.lat, activeStop.location.lng)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title={t('route.open')} variant="secondary" size="lg" onPress={() => router.push(`/stop/${activeStop.stopId}`)} />
              </View>
            </Row>
          </Card>
        </View>
      ) : null}

      {route.data?.status === 'COMPLETED' ? (
        <Card tone="primary">
          <Row gap={3}>
            <TiffinArt size={56} steam />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading" style={{ color: theme.colors.onPrimarySoft }}>{t('route.completed')}</Text>
              <Text variant="caption" style={{ color: theme.colors.onPrimarySoft }}>{t('route.completedHint', { count: doneCount })}</Text>
            </View>
          </Row>
        </Card>
      ) : null}

      {stops.length === 0 && shift ? (
        <EmptyState art={<TiffinArt size={80} mood="accent" />} title={t('route.empty')} message={t('route.emptyHint')} />
      ) : null}

      {stops.length > 0 ? (
        <View style={{ gap: 10 }}>
          <SectionHeader title={t('route.allStops')} />
          <View>
            {stops.map((s, i) => (
              <StopRow key={s.stopId} stop={s} current={routeActive && s.stopId === activeStop?.stopId} last={i === stops.length - 1} />
            ))}
          </View>
        </View>
      ) : null}

      {shift?.status === 'ACTIVE' && (route.data?.status === 'COMPLETED' || stops.length === 0) ? (
        <Button title={t('shift.end')} variant="outline" onPress={() => endShift.mutate()} loading={endShift.isPending} />
      ) : null}
    </Screen>
  );
}
