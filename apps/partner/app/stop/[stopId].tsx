import type { TodayRoute } from '@lunchbox/api-client';
import { Banner, Button, Card, Loading, Screen, Text, TextField } from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../src/lib/api';
import { currentPosition } from '../../src/lib/locationTask';
import { navigateTo } from '../../src/lib/navigation';
import { runOrQueue } from '../../src/lib/offlineQueue';
import { errorMessage } from '../../src/lib/queryClient';

export default function StopScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const route = useQuery<TodayRoute>({ queryKey: ['route'], queryFn: api.partner.todayRoute });
  const [otp, setOtp] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = (queued: boolean) => {
    setNotice(queued ? t('stop.queued') : null);
    void qc.invalidateQueries({ queryKey: ['route'] });
  };
  const fail = (e: unknown) => setError(errorMessage(e));

  const arrive = useMutation({
    mutationFn: async () => api.partner.arrive(stopId, await currentPosition()),
    onSuccess: (data) => qc.setQueryData(['route'], data),
    onError: fail,
  });
  const call = useMutation({ mutationFn: (orderId: string) => api.partner.callParent(orderId), onError: fail });
  const pickup = useMutation({
    mutationFn: async (orderId: string) =>
      runOrQueue({ kind: 'pickup', orderId, body: { method: 'OTP', code: otp.trim(), location: await currentPosition() } }),
    onSuccess: (r) => {
      done(r.queued);
      if (!r.queued) router.back();
    },
    onError: fail,
  });
  const pickupFailed = useMutation({
    mutationFn: async (orderId: string) =>
      runOrQueue({ kind: 'pickupFailed', orderId, body: { reason: reason.trim(), location: await currentPosition() } }),
    onSuccess: (r) => done(r.queued),
    onError: fail,
  });
  const deliveryFailed = useMutation({
    mutationFn: async (orderId: string) =>
      runOrQueue({ kind: 'deliveryFailed', orderId, body: { reason: reason.trim(), location: await currentPosition() } }),
    onSuccess: (r) => done(r.queued),
    onError: fail,
  });

  if (route.isLoading) return <Loading />;
  const stop = route.data?.stops.find((s) => s.stopId === stopId);
  if (!stop) return <Screen><Banner tone="warning">Stop not found</Banner></Screen>;
  const open = stop.status === 'PENDING' || stop.status === 'ARRIVED';

  return (
    <Screen>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {notice ? <Banner tone="warning">{notice}</Banner> : null}
      <Button title={t('route.navigate')} variant="secondary" onPress={() => void navigateTo(stop.location.lat, stop.location.lng)} />

      {stop.pickup ? (
        <>
          <Card>
            <Text variant="heading">{stop.pickup.parentFirstName}</Text>
            <Text>{stop.pickup.childFirstName} · {stop.pickup.className}</Text>
            <Text muted>{stop.pickup.address}</Text>
            {stop.pickup.landmark ? <Text muted>{stop.pickup.landmark}</Text> : null}
            {stop.pickup.instructions ? (
              <>
                <Text variant="label">{t('stop.instructions')}</Text>
                <Text>{stop.pickup.instructions}</Text>
              </>
            ) : null}
            {stop.pickup.maskedPhone ? <Text variant="caption" muted>{stop.pickup.maskedPhone}</Text> : null}
            <Button title={call.isSuccess ? t('stop.calling') : t('stop.callParent')} variant="ghost"
                    loading={call.isPending} onPress={() => call.mutate(stop.pickup!.orderId)} />
          </Card>
          {open ? (
            <Card>
              {stop.status === 'PENDING' ? (
                <Button title={t('stop.arrived')} variant="secondary" loading={arrive.isPending} onPress={() => arrive.mutate()} />
              ) : null}
              <TextField label={t('stop.enterOtp')} keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} testID="otp" />
              <Button title={t('stop.confirmOtp')} disabled={otp.length !== 6} loading={pickup.isPending}
                      onPress={() => pickup.mutate(stop.pickup!.orderId)} testID="confirm-pickup" />
              <Button title={t('stop.scanQr')} variant="ghost" onPress={() => router.push(`/scan/${stop.pickup!.orderId}`)} />
              <TextField label={t('stop.failReason')} value={reason} onChangeText={setReason} />
              <Button title={t('stop.pickupFailed')} variant="danger" disabled={reason.trim().length < 3}
                      loading={pickupFailed.isPending} onPress={() => pickupFailed.mutate(stop.pickup!.orderId)} />
            </Card>
          ) : null}
        </>
      ) : null}

      {stop.drop ? (
        <>
          <Card>
            <Text variant="heading">{stop.drop.schoolName}</Text>
            <Text muted>{stop.drop.address}</Text>
            {stop.drop.handoverInstructions ? <Text>{stop.drop.handoverInstructions}</Text> : null}
            <Text variant="label">{t('stop.lunchboxes', { count: stop.drop.orderIds.length })}</Text>
          </Card>
          {open ? (
            <Card>
              {stop.status === 'PENDING' ? (
                <Button title={t('stop.arrived')} variant="secondary" loading={arrive.isPending} onPress={() => arrive.mutate()} />
              ) : null}
              <Button title={t('stop.handover')} onPress={() => router.push(`/handover/${stop.drop!.schoolId}`)} testID="handover" />
              <TextField label={t('stop.failReason')} value={reason} onChangeText={setReason} />
              {stop.drop.orderIds.map((orderId, i) => (
                <Button key={orderId} title={`${t('stop.deliveryFailed')} #${i + 1}`} variant="danger"
                        disabled={reason.trim().length < 3} loading={deliveryFailed.isPending}
                        onPress={() => deliveryFailed.mutate(orderId)} />
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
