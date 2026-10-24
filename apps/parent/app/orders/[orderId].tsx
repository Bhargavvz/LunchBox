import { etaText, istDateTime, istTime } from '@lunchbox/api-client';
import { Banner, Button, Card, Loading, Row, Screen, StatusPill, Text, Timeline } from '@lunchbox/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, Linking } from 'react-native';
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
  const labels = useStatusLabels();
  const detail = useQuery({ queryKey: ['order', orderId], queryFn: () => api.orders.detail(orderId) });
  const { snapshot, position, etaSeconds } = useOrderTracking(orderId);
  const call = useMutation({ mutationFn: () => api.orders.callPartner(orderId) });
  const photo = useMutation({
    mutationFn: () => api.orders.handoverPhoto(orderId),
    onSuccess: (r) => void Linking.openURL(r.url),
  });

  if (detail.isLoading || snapshot.isLoading) return <Loading />;
  if (detail.error) return <Banner tone="danger">{errorMessage(detail.error)}</Banner>;
  const order = detail.data!.order;
  const snap = snapshot.data;
  const live = snap && ['PARTNER_EN_ROUTE', 'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL'].includes(snap.status);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="heading">{order.childName}</Text>
        <StatusPill status={order.status} labels={labels} />
      </Row>
      {live && snap ? (
        <>
          {snap.liveTrackingEnabled ? (
            <LiveMap partner={position} destination={snap.destination}
                     destinationLabel={snap.destinationType === 'HOME' ? 'Home' : order.schoolName ?? 'School'} />
          ) : (
            <Banner tone="info">{t('track.consentOff')}</Banner>
          )}
          {etaSeconds !== null ? (
            <Text variant="heading" accessibilityRole="text">
              {snap.destinationType === 'HOME'
                ? t('track.eta', { eta: etaText(etaSeconds) })
                : t('track.etaSchool', { eta: etaText(etaSeconds) })}
            </Text>
          ) : null}
        </>
      ) : null}

      {snap?.partner ? (
        <Card>
          <Text variant="label" muted>{t('track.partner')}</Text>
          <Row>
            {snap.partner.photoUrl ? (
              <Image source={{ uri: snap.partner.photoUrl }} style={{ width: 56, height: 56, borderRadius: 28 }}
                     accessibilityLabel={snap.partner.firstName} />
            ) : null}
            <Text variant="heading" style={{ flex: 1 }}>{snap.partner.firstName}</Text>
          </Row>
          <Text muted>
            {snap.partner.vehicleType} · {snap.partner.vehicleNumber ?? ''}
            {snap.partner.rating ? ` · ★ ${snap.partner.rating}` : ''}
          </Text>
          {live ? (
            <Button title={call.isSuccess ? t('track.calling') : t('track.callPartner')} variant="secondary"
                    loading={call.isPending} onPress={() => call.mutate()} />
          ) : null}
          {call.error ? <Banner tone="danger">{errorMessage(call.error)}</Banner> : null}
        </Card>
      ) : null}

      {order.status === 'PARTNER_EN_ROUTE' || order.status === 'ASSIGNED' ? <PickupCode orderId={orderId} /> : null}

      <Card>
        <Text variant="caption" muted>
          {t('today.pickupWindow', { from: istTime(order.pickupWindowStart), to: istTime(order.pickupWindowEnd) })}
        </Text>
        <Timeline current={order.status} labels={labels}
                  events={detail.data!.timeline.map((e) => ({ status: e.status, occurredAt: e.occurredAt }))}
                  formatTime={(iso) => istDateTime(iso)} />
      </Card>

      {order.status === 'DELIVERED' ? (
        <>
          <RateDelivery orderId={orderId} rated={order.ratingStars ?? null} canRate={order.canRate} />
          <Button title={t('track.handoverPhoto')} variant="ghost" loading={photo.isPending} onPress={() => photo.mutate()} />
        </>
      ) : null}
    </Screen>
  );
}
