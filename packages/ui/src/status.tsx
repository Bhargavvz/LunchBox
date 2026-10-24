import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text as RNText, View } from 'react-native';
import { Text, LiveDot } from './components';
import { useTheme } from './theme';
import type { Theme } from './tokens';

export type OrderStatusName =
  | 'SCHEDULED'
  | 'ASSIGNED'
  | 'REASSIGNED'
  | 'PARTNER_EN_ROUTE'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'AT_SCHOOL'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'PICKUP_FAILED'
  | 'DELIVERY_FAILED';

export type StatusLabels = Record<OrderStatusName, string>;

export const defaultStatusLabels: StatusLabels = {
  SCHEDULED: 'Scheduled',
  ASSIGNED: 'Partner assigned',
  REASSIGNED: 'Finding a partner',
  PARTNER_EN_ROUTE: 'Partner on the way',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'On the way to school',
  AT_SCHOOL: 'At school',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  PICKUP_FAILED: 'Pickup missed',
  DELIVERY_FAILED: 'Delivery problem',
};

export type StatusTone = 'waiting' | 'active' | 'done' | 'problem' | 'off';

export function statusTone(status: OrderStatusName): StatusTone {
  switch (status) {
    case 'DELIVERED':
      return 'done';
    case 'CANCELLED':
      return 'off';
    case 'PICKUP_FAILED':
    case 'DELIVERY_FAILED':
      return 'problem';
    case 'PARTNER_EN_ROUTE':
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'AT_SCHOOL':
      return 'active';
    default:
      return 'waiting';
  }
}

/** True while a lunchbox is moving and the map is worth opening. */
export function isLive(status: OrderStatusName): boolean {
  return statusTone(status) === 'active';
}

function toneColours(t: Theme, tone: StatusTone): [string, string] {
  const c = t.colors;
  return {
    waiting: [c.sunken, c.textMuted],
    active: [c.infoSoft, c.onInfoSoft],
    done: [c.primarySoft, c.onPrimarySoft],
    problem: [c.dangerSoft, c.onDangerSoft],
    off: [c.sunken, c.textFaint],
  }[tone] as [string, string];
}

export function StatusPill({ status, labels = defaultStatusLabels }: { status: OrderStatusName; labels?: StatusLabels }) {
  const t = useTheme();
  const tone = statusTone(status);
  const [bg, fg] = toneColours(t, tone);
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${labels[status]}`}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bg,
        borderRadius: t.radius.pill, paddingLeft: 8, paddingRight: 10, paddingVertical: 4 }}
    >
      {tone === 'active' ? (
        <LiveDot color={fg} size={6} />
      ) : (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />
      )}
      <RNText style={{ color: fg, fontSize: 12, fontFamily: t.fonts.bold, letterSpacing: 0.1 }}>{labels[status]}</RNText>
    </View>
  );
}

const PROGRESS: Record<OrderStatusName, number> = {
  SCHEDULED: 0,
  REASSIGNED: 0,
  ASSIGNED: 0.04,
  PARTNER_EN_ROUTE: 0.18,
  PICKUP_FAILED: 0.18,
  PICKED_UP: 0.5,
  IN_TRANSIT: 0.72,
  DELIVERY_FAILED: 0.72,
  AT_SCHOOL: 0.93,
  DELIVERED: 1,
  CANCELLED: 0,
};

/**
 * Home → road → school rail. The filled stretch eases to the current stage; a pulse sits at its tip while the
 * lunchbox is moving, and turns red where a problem stopped it.
 */
export function JourneyRail({
  status,
  labels,
}: {
  status: OrderStatusName;
  labels: { home: string; road: string; school: string };
}) {
  const t = useTheme();
  const tone = statusTone(status);
  const target = PROGRESS[status];
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    Animated.timing(progress, { toValue: target, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [target, progress]);
  const fill = tone === 'problem' ? t.colors.danger : tone === 'off' ? t.colors.borderStrong : t.colors.primary;
  const reached = (at: number) => target >= at && tone !== 'off';
  const node = (at: number) => (
    <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: reached(at) ? fill : t.colors.border,
      backgroundColor: reached(at) ? t.colors.surface : t.colors.sunken }} />
  );
  return (
    <View accessible accessibilityLabel={`${labels.home}, ${labels.road}, ${labels.school}`} style={{ gap: 8 }}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 14, justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 7, right: 7, height: 4, borderRadius: 2, backgroundColor: t.colors.sunken }} />
        <Animated.View
          style={{
            position: 'absolute',
            left: 7,
            height: 4,
            borderRadius: 2,
            backgroundColor: fill,
            width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, width - 14)] }),
          }}
        />
        {tone === 'active' && width > 0 ? (
          <Animated.View
            style={{
              position: 'absolute',
              top: -5,
              left: progress.interpolate({ inputRange: [0, 1], outputRange: [7 - 12, width - 7 - 12] }),
            }}
          >
            <LiveDot size={10} />
          </Animated.View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {node(0.04)}
          {node(0.5)}
          {node(1)}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" tone={reached(0.04) ? 'default' : 'muted'}>{labels.home}</Text>
        <Text variant="caption" tone={reached(0.5) ? 'default' : 'muted'}>{labels.road}</Text>
        <Text variant="caption" tone={reached(1) ? 'default' : 'muted'}>{labels.school}</Text>
      </View>
    </View>
  );
}

const JOURNEY: OrderStatusName[] = ['ASSIGNED', 'PARTNER_EN_ROUTE', 'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL', 'DELIVERED'];

/** Vertical journey timeline; reached steps show their time, the current step pulses. */
export function Timeline({
  current,
  events,
  labels = defaultStatusLabels,
  formatTime,
}: {
  current: OrderStatusName;
  events: { status: OrderStatusName; occurredAt: string }[];
  labels?: StatusLabels;
  formatTime: (iso: string) => string;
}) {
  const t = useTheme();
  const reached = new Map(events.map((e) => [e.status, e.occurredAt]));
  const failed = current === 'PICKUP_FAILED' || current === 'DELIVERY_FAILED' || current === 'CANCELLED';
  const failedAt = failed ? reached.get(current) : undefined;
  return (
    <View accessibilityRole="list">
      {JOURNEY.map((step, i) => {
        const at = reached.get(step);
        const done = at !== undefined;
        const isCurrent = step === current && current !== 'DELIVERED';
        const last = i === JOURNEY.length - 1 && !failed;
        return (
          <View key={step} style={{ flexDirection: 'row', gap: t.spacing(3.5) }} accessible
                accessibilityLabel={`${labels[step]}${at ? `, ${formatTime(at)}` : ''}`}>
            <View style={{ alignItems: 'center', width: 22 }}>
              {isCurrent ? (
                <View style={{ marginTop: -3 }}><LiveDot size={10} /></View>
              ) : (
                <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 4, borderWidth: 2.5,
                  borderColor: done ? t.colors.primary : t.colors.borderStrong,
                  backgroundColor: done ? t.colors.primary : t.colors.surface }} />
              )}
              {!last ? (
                <View style={{ flex: 1, width: 2, minHeight: 20, marginVertical: 3, borderRadius: 1,
                  backgroundColor: done && reached.has(JOURNEY[i + 1]!) ? t.colors.primary : t.colors.border }} />
              ) : null}
            </View>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: last ? 0 : t.spacing(4) }}>
              <Text variant={isCurrent ? 'bodyStrong' : 'body'} tone={done || isCurrent ? 'default' : 'faint'}>
                {labels[step]}
              </Text>
              {at ? <Text variant="caption" muted style={{ paddingTop: 3 }}>{formatTime(at)}</Text> : null}
            </View>
          </View>
        );
      })}
      {failed ? (
        <View style={{ flexDirection: 'row', gap: t.spacing(3.5) }}>
          <View style={{ width: 22, alignItems: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 4, backgroundColor: t.colors.danger }} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyStrong" tone="danger">{labels[current]}</Text>
            {failedAt ? <Text variant="caption" muted style={{ paddingTop: 3 }}>{formatTime(failedAt)}</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
