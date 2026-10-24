import { istTime, type TodayRoute } from '@lunchbox/api-client';
import {
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  Icon,
  Loading,
  OtpInput,
  PressableScale,
  Row,
  Screen,
  SectionHeader,
  Text,
  TextField,
  haptic,
  useTheme,
  useToast,
} from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronDown,
  ChevronUp,
  Clock3,
  House,
  MapPinCheck,
  MessageSquareWarning,
  Navigation,
  Package,
  Phone,
  ScanLine,
  School,
  TriangleAlert,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '../../src/lib/api';
import { currentPosition } from '../../src/lib/locationTask';
import { navigateTo } from '../../src/lib/navigation';
import { runOrQueue } from '../../src/lib/offlineQueue';
import { errorMessage } from '../../src/lib/queryClient';

const PICKUP_REASONS = ['noAnswer', 'notReady', 'wrongAddress'] as const;
const DROP_REASONS = ['schoolClosed', 'refused', 'damaged'] as const;

export default function StopScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const route = useQuery<TodayRoute>({ queryKey: ['route'], queryFn: api.partner.todayRoute });
  const [otp, setOtp] = useState('');
  const [reason, setReason] = useState('');
  const [problemOpen, setProblemOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = (queued: boolean, message: string) => {
    toast(queued ? t('stop.queued') : message, queued ? 'info' : 'success');
    void qc.invalidateQueries({ queryKey: ['route'] });
  };
  const fail = (e: unknown) => {
    haptic.error();
    setError(errorMessage(e));
  };

  const arrive = useMutation({
    mutationFn: async () => api.partner.arrive(stopId, await currentPosition()),
    onSuccess: (data) => {
      haptic.success();
      qc.setQueryData(['route'], data);
    },
    onError: fail,
  });
  const call = useMutation({
    mutationFn: (orderId: string) => api.partner.callParent(orderId),
    onSuccess: () => toast(t('stop.calling'), 'info'),
    onError: fail,
  });
  const pickup = useMutation({
    mutationFn: async (orderId: string) =>
      runOrQueue({ kind: 'pickup', orderId, body: { method: 'OTP', code: otp.trim(), location: await currentPosition() } }),
    onSuccess: (r) => {
      done(r.queued, t('stop.pickedUp'));
      if (!r.queued) router.back();
    },
    onError: (e) => {
      setOtp('');
      fail(e);
    },
  });
  const pickupFailed = useMutation({
    mutationFn: async (orderId: string) =>
      runOrQueue({ kind: 'pickupFailed', orderId, body: { reason: reason.trim(), location: await currentPosition() } }),
    onSuccess: (r) => done(r.queued, t('stop.reported')),
    onError: fail,
  });
  const deliveryFailed = useMutation({
    mutationFn: async (orderId: string) =>
      runOrQueue({ kind: 'deliveryFailed', orderId, body: { reason: reason.trim(), location: await currentPosition() } }),
    onSuccess: (r) => done(r.queued, t('stop.reported')),
    onError: fail,
  });

  if (route.isLoading) return <Loading label={t('common.loading')} />;
  const stop = route.data?.stops.find((s) => s.stopId === stopId);
  if (!stop) return <Screen><Banner tone="warning">{t('stop.notFound')}</Banner></Screen>;
  const open = stop.status === 'PENDING' || stop.status === 'ARRIVED';
  const arrived = stop.status === 'ARRIVED';
  const total = route.data?.stops.length ?? 0;
  const isPickup = !!stop.pickup;
  const reasons = isPickup ? PICKUP_REASONS : DROP_REASONS;

  const problem = (
    <Card tone="sunken" gap={3}>
      <PressableScale onPress={() => setProblemOpen((v) => !v)} scaleTo={0.99} accessibilityRole="button"
                      accessibilityState={{ selected: problemOpen }} accessibilityLabel={t('stop.problemTitle')}>
        <Row gap={2.5}>
          <Icon as={MessageSquareWarning} size={20} color="danger" />
          <Text variant="subheading" style={{ flex: 1 }}>{t('stop.problemTitle')}</Text>
          <Icon as={problemOpen ? ChevronUp : ChevronDown} size={20} color="textMuted" />
        </Row>
      </PressableScale>
      {problemOpen ? (
        <>
          <Row gap={2} wrap>
            {reasons.map((r) => (
              <Chip key={r} label={t(`stop.reasons.${r}`)} role="radio" selected={reason === t(`stop.reasons.${r}`)}
                    onPress={() => setReason(t(`stop.reasons.${r}`))} />
            ))}
          </Row>
          <TextField label={t('stop.failReason')} value={reason} onChangeText={setReason} maxLength={300} multiline />
          {stop.pickup ? (
            <Button title={t('stop.pickupFailed')} variant="danger" size="lg" disabled={reason.trim().length < 3}
                    loading={pickupFailed.isPending} onPress={() => pickupFailed.mutate(stop.pickup!.orderId)} />
          ) : null}
          {stop.drop?.orderIds.map((orderId, i) => (
            <Button key={orderId} title={t('stop.deliveryFailedN', { n: i + 1 })} variant="dangerSoft"
                    disabled={reason.trim().length < 3} loading={deliveryFailed.isPending && deliveryFailed.variables === orderId}
                    onPress={() => deliveryFailed.mutate(orderId)} />
          ))}
        </>
      ) : null}
    </Card>
  );

  return (
    <Screen keyboard>
      {error ? <Banner tone="danger" title={t('common.problem')}>{error}</Banner> : null}

      <Card tone="raised" gap={3}>
        <Row gap={2}>
          <Icon as={isPickup ? House : School} size={18} color={isPickup ? 'accent' : 'info'} />
          <Text variant="overline" muted style={{ flex: 1 }}>
            {isPickup ? t('route.pickup') : t('route.drop')} · {t('route.stopOf', { n: stop.sequence, total })}
          </Text>
          {!open ? <Badge label={t(`stop.status.${stop.status}`)} tone={stop.status === 'COMPLETED' ? 'primary' : 'danger'} /> : null}
        </Row>
        {stop.pickup ? (
          <>
            <Text variant="title">{stop.pickup.parentFirstName}</Text>
            <Text variant="bodyStrong">{t('stop.childLine', { child: stop.pickup.childFirstName, cls: stop.pickup.className })}</Text>
            <Text muted>{stop.pickup.address}</Text>
            {stop.pickup.landmark ? <Text variant="caption" muted>{t('stop.landmark', { landmark: stop.pickup.landmark })}</Text> : null}
            <Row gap={1.5}>
              <Icon as={Clock3} size={14} color="textMuted" />
              <Text variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
                {t('route.window', { from: istTime(stop.pickup.pickupWindowStart), to: istTime(stop.pickup.pickupWindowEnd) })}
              </Text>
            </Row>
          </>
        ) : null}
        {stop.drop ? (
          <>
            <Text variant="title">{stop.drop.schoolName}</Text>
            <Text muted>{stop.drop.address}</Text>
            <Row gap={4}>
              <Row gap={1.5}>
                <Icon as={Package} size={15} color="textMuted" />
                <Text variant="bodyStrong">{t('stop.lunchboxes', { count: stop.drop.orderIds.length })}</Text>
              </Row>
              {stop.drop.deadline ? (
                <Row gap={1.5}>
                  <Icon as={Clock3} size={15} color="textMuted" />
                  <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{t('route.deadline', { time: istTime(stop.drop.deadline) })}</Text>
                </Row>
              ) : null}
            </Row>
          </>
        ) : null}

        {(stop.pickup?.instructions || stop.drop?.handoverInstructions) ? (
          <Row gap={2.5} align="flex-start" style={{ backgroundColor: theme.colors.accentSoft, borderRadius: theme.radius.md, padding: 12 }}>
            <Icon as={TriangleAlert} size={18} color="onAccentSoft" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="overline" style={{ color: theme.colors.onAccentSoft }}>{t('stop.instructions')}</Text>
              <Text style={{ color: theme.colors.onAccentSoft }}>{stop.pickup?.instructions ?? stop.drop?.handoverInstructions}</Text>
            </View>
          </Row>
        ) : null}

        <Row gap={2.5}>
          <View style={{ flex: 1 }}>
            <Button title={t('route.navigate')} icon={Navigation} size="lg"
                    onPress={() => void navigateTo(stop.location.lat, stop.location.lng)} />
          </View>
          {stop.pickup ? (
            <View style={{ flex: 1 }}>
              <Button title={t('stop.callParent')} variant="secondary" icon={Phone} size="lg" loading={call.isPending}
                      onPress={() => call.mutate(stop.pickup!.orderId)} accessibilityHint={stop.pickup.maskedPhone ?? undefined} />
            </View>
          ) : null}
        </Row>
      </Card>

      {open && stop.status === 'PENDING' ? (
        <Button title={t('stop.arrived')} variant="outline" icon={MapPinCheck} size="lg" loading={arrive.isPending}
                onPress={() => arrive.mutate()} />
      ) : null}
      {arrived ? (
        <Row gap={2} style={{ alignSelf: 'center' }}>
          <Icon as={MapPinCheck} size={16} color="primary" />
          <Text variant="label" tone="primary">
            {stop.arrivedAt ? t('stop.arrivedAt', { time: istTime(stop.arrivedAt) }) : t('stop.arrivedShort')}
          </Text>
        </Row>
      ) : null}

      {open && stop.pickup ? (
        <View style={{ gap: 10 }}>
          <SectionHeader title={t('stop.verifyTitle')} />
          <Card tone="raised" gap={4}>
            <Text muted>{t('stop.verifyHint', { name: stop.pickup.parentFirstName })}</Text>
            <OtpInput label={t('stop.enterOtp')} value={otp} onChange={(v) => { setOtp(v); if (error) setError(null); }}
                      error={!!error} testID="otp" />
            <Button title={t('stop.confirmOtp')} size="lg" disabled={otp.length !== 6} loading={pickup.isPending}
                    onPress={() => pickup.mutate(stop.pickup!.orderId)} testID="confirm-pickup" />
            <Button title={t('stop.scanQr')} variant="outline" icon={ScanLine} onPress={() => router.push(`/scan/${stop.pickup!.orderId}`)} />
          </Card>
        </View>
      ) : null}

      {open && stop.drop ? (
        <Button title={t('stop.handover')} size="lg" onPress={() => router.push(`/handover/${stop.drop!.schoolId}`)} testID="handover" />
      ) : null}

      {open ? problem : null}
    </Screen>
  );
}
