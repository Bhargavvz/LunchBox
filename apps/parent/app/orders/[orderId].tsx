import { etaText, istDateTime, istTime } from '@lunchbox/api-client';
import {
  Avatar,
  Banner,
  Button,
  Card,
  Icon,
  JourneyRail,
  Loading,
  Row,
  Screen,
  SectionHeader,
  StatusPill,
  Text,
  TiffinArt,
  Timeline,
  isLive,
  useTheme,
  useToast,
} from '@lunchbox/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Camera, Clock3, Phone, Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Image, Linking, View, useWindowDimensions } from 'react-native';
import { LiveMap } from '../../src/components/LiveMap';
import { PickupCode } from '../../src/components/PickupCode';
import { RateDelivery } from '../../src/components/RateDelivery';
import { useOrderTracking } from '../../src/hooks/useOrderTracking';
import { useStatusLabels } from '../../src/hooks/useStatusLabels';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

export default function OrderTrackingScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const toast = useToast();
  const { height: screenHeight } = useWindowDimensions();
  const labels = useStatusLabels();
  const detail = useQuery({ queryKey: ['order', orderId], queryFn: () => api.orders.detail(orderId) });
  const { snapshot, position, etaSeconds } = useOrderTracking(orderId);
  const call = useMutation({
    mutationFn: () => api.orders.callPartner(orderId),
    onSuccess: () => toast(t('track.calling')),
  });
  const photo = useMutation({
    mutationFn: () => api.orders.handoverPhoto(orderId),
    onSuccess: (r) => void Linking.openURL(r.url),
  });

  if (detail.isLoading || snapshot.isLoading) return <Loading label={t('common.loading')} />;
  if (detail.error) {
    return (
      <Screen>
        <Banner tone="danger" title={t('common.problem')}
                action={<Button title={t('common.retry')} size="sm" variant="outline" inline onPress={() => void detail.refetch()} />}>
          {errorMessage(detail.error)}
        </Banner>
      </Screen>
    );
  }
  const order = detail.data!.order;
  const snap = snapshot.data;
  const live = !!snap && isLive(snap.status);
  const showMap = live && !!snap?.liveTrackingEnabled && !!snap.destination;
  const toHome = snap?.destinationType === 'HOME';
  const destinationLabel = toHome ? t('track.home') : order.schoolName ?? t('today.rail.school');

  const sheet = (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <StatusPill status={order.status} labels={labels} />
        {live && etaSeconds !== null ? (
          <View accessible accessibilityRole="text"
                accessibilityLabel={toHome ? t('track.eta', { eta: etaText(etaSeconds) }) : t('track.etaSchool', { eta: etaText(etaSeconds) })}>
            <Text variant="caption" muted style={{ marginTop: 6 }}>{toHome ? t('track.arrivingHome') : t('track.arrivingSchool')}</Text>
            <Text variant="display" style={{ fontVariant: ['tabular-nums'] }}>{etaText(etaSeconds)}</Text>
          </View>
        ) : (
          <Text variant="title" style={{ marginTop: 4 }}>{order.childName}</Text>
        )}
        <Text muted>
          {live && etaSeconds !== null ? `${order.childName} · ${order.schoolName}` : order.schoolName}
        </Text>
      </View>

      <JourneyRail status={order.status}
                   labels={{ home: t('today.rail.home'), road: t('today.rail.road'), school: t('today.rail.school') }} />

      {live && !snap?.liveTrackingEnabled ? <Banner tone="info">{t('track.consentOff')}</Banner> : null}

      {!live && order.status !== 'DELIVERED' ? (
        <Card tone="sunken">
          <Row gap={3}>
            <TiffinArt size={52} mood={order.status === 'CANCELLED' ? 'muted' : 'brand'} />
            <View style={{ flex: 1, gap: 4 }}>
              <Row gap={1.5}>
                <Icon as={Clock3} size={14} color="textMuted" />
                <Text variant="overline" muted>{t('today.pickup')}</Text>
              </Row>
              <Text variant="bodyStrong">
                {t('today.pickupWindow', { from: istTime(order.pickupWindowStart), to: istTime(order.pickupWindowEnd) })}
              </Text>
              <Text variant="caption" muted>{t('today.deadline', { time: istTime(order.deliveryDeadline) })}</Text>
            </View>
          </Row>
        </Card>
      ) : null}

      {order.failureReason ? <Banner tone="danger">{order.failureReason}</Banner> : null}
      {order.cancelReason ? <Banner tone="warning">{order.cancelReason}</Banner> : null}

      {snap?.partner ? (
        <Card tone="raised">
          <Text variant="overline" muted>{t('track.partner')}</Text>
          <Row gap={3}>
            {snap.partner.photoUrl ? (
              <Image source={{ uri: snap.partner.photoUrl }} accessibilityLabel={snap.partner.firstName}
                     style={{ width: 52, height: 52, borderRadius: 20, backgroundColor: theme.colors.sunken }} />
            ) : (
              <Avatar name={snap.partner.firstName ?? ''} size={52} />
            )}
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="heading" numberOfLines={1}>{snap.partner.firstName}</Text>
              <Text variant="caption" muted numberOfLines={1}>
                {[snap.partner.vehicleType ? t(`track.vehicle.${snap.partner.vehicleType}`) : null, snap.partner.vehicleNumber]
                  .filter(Boolean).join(' · ')}
              </Text>
            </View>
            {snap.partner.rating ? (
              <Row gap={1} accessible accessibilityLabel={t('track.ratingLabel', { rating: snap.partner.rating })}>
                <Icon as={Star} size={14} color={theme.colors.accent} />
                <Text variant="label">{Number(snap.partner.rating).toFixed(1)}</Text>
              </Row>
            ) : null}
          </Row>
          {live ? (
            <Button title={t('track.callPartner')} variant="secondary" icon={Phone} loading={call.isPending}
                    onPress={() => call.mutate()} accessibilityHint={t('track.callHint')} />
          ) : null}
          {call.error ? <Banner tone="danger">{errorMessage(call.error)}</Banner> : null}
        </Card>
      ) : null}

      {order.status === 'PARTNER_EN_ROUTE' || order.status === 'ASSIGNED' ? <PickupCode orderId={orderId} /> : null}

      <Card>
        <SectionHeader title={t('track.journey')} />
        <Timeline current={order.status} labels={labels}
                  events={detail.data!.timeline.map((e) => ({ status: e.status, occurredAt: e.occurredAt }))}
                  formatTime={(iso) => istDateTime(iso)} />
      </Card>

      {order.status === 'DELIVERED' ? (
        <>
          <RateDelivery orderId={orderId} rated={order.ratingStars ?? null} canRate={order.canRate} />
          <Button title={t('track.handoverPhoto')} variant="outline" icon={Camera} loading={photo.isPending}
                  onPress={() => photo.mutate()} />
          {photo.error ? <Banner tone="danger">{errorMessage(photo.error)}</Banner> : null}
        </>
      ) : null}
    </View>
  );

  if (!showMap || !snap) {
    return (
      <Screen refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()}>
        <Stack.Screen options={{ title: t('track.title'), headerTransparent: false }} />
        {sheet}
      </Screen>
    );
  }

  return (
    <Screen padded={false} gap={0}>
      <Stack.Screen options={{ title: '', headerTransparent: true }} />
      <LiveMap
        partner={position}
        destination={snap.destination!}
        destinationType={toHome ? 'HOME' : 'SCHOOL'}
        destinationLabel={destinationLabel}
        partnerLabel={snap.partner?.firstName ?? t('track.partner')}
        recenterLabel={t('track.recenter')}
        height={Math.round(screenHeight * 0.48)}
      />
      <View style={{ marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: theme.colors.background,
        paddingHorizontal: 20, paddingTop: 12 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.borderStrong,
          marginBottom: 14 }} />
        {sheet}
      </View>
    </Screen>
  );
}
