import { useEffect, useRef } from 'react';
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
    active: [c.primarySoft, c.onPrimarySoft],
    done: [c.successSoft, c.onSuccessSoft],
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
      <RNText style={{ color: fg, fontSize: 13, lineHeight: 18, fontFamily: t.fonts.semibold, includeFontPadding: false }}>{labels[status]}</RNText>
    </View>
  );
}


/** Which tiffin tier the lunchbox is in: 0 home, 1 on the road, 2 school. */
function tierOf(status: OrderStatusName): number {
  if (['PICKED_UP', 'IN_TRANSIT', 'DELIVERY_FAILED'].includes(status)) return 1;
  if (['AT_SCHOOL', 'DELIVERED'].includes(status)) return 2;
  return 0;
}

/**
 * The LunchBox signature: the journey drawn as a tiffin laid on its side. Three tiers (home, road, school) are
 * held together by steel clamps; tiers already passed are chalk green, the tier the lunchbox is in now is turmeric
 * and breathes gently while it moves, a problem turns its tier chilli red, and the rest stay plain steel.
 * The name and signature are kept from the earlier rail so every screen that shows a journey gets the tiers.
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
  const current = tierOf(status);
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (tone !== 'active') return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [tone, breathe]);
  const names = [labels.home, labels.road, labels.school];
  const state = (i: number): 'done' | 'now' | 'problem' | 'next' => {
    if (tone === 'off') return 'next';
    if (tone === 'done') return 'done';
    if (i < current) return 'done';
    if (i === current) return tone === 'problem' ? 'problem' : status === 'SCHEDULED' || status === 'REASSIGNED' ? 'next' : 'now';
    return 'next';
  };
  const colours = {
    done: { bg: t.colors.primary, fg: t.colors.onPrimary, rim: t.colors.primaryPressed },
    now: { bg: t.colors.accent, fg: t.colors.onAccent, rim: t.dark ? '#C98F2E' : '#C9871F' },
    problem: { bg: t.colors.danger, fg: t.colors.onDanger, rim: t.colors.onDangerSoft },
    next: { bg: t.colors.sunken, fg: t.colors.textMuted, rim: t.colors.border },
  };
  const spoken = names.map((n, i) => `${n}: ${{ done: 'done', now: 'now', problem: 'problem', next: 'next' }[state(i)]}`).join(', ');
  return (
    <View accessible accessibilityLabel={spoken} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {names.map((name, i) => {
          const st = state(i);
          const c = colours[st];
          const tier = (
            <View style={{ height: 34, borderRadius: 12, backgroundColor: c.bg, borderBottomWidth: 3, borderBottomColor: c.rim,
              alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
              {/* The painted lid stripe every steel tier has. */}
              <View style={{ width: 18, height: 4, borderRadius: 2, backgroundColor: c.fg, opacity: st === 'next' ? 0.35 : 0.85 }} />
            </View>
          );
          return (
            <View key={name} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              {i > 0 ? (
                // Steel clamp joining two tiers; it takes the colour of the tier it leads into once that tier is reached.
                <View style={{ width: 8, height: 6, marginHorizontal: -1, borderRadius: 2,
                  backgroundColor: st === 'next' ? t.colors.borderStrong : colours[st].rim }} />
              ) : null}
              <View style={{ flex: 1 }}>
                {st === 'now' ? (
                  <Animated.View style={{ transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }] }}>
                    {tier}
                  </Animated.View>
                ) : tier}
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {names.map((name, i) => {
          const st = state(i);
          return (
            <Text key={name} variant="caption" numberOfLines={1}
                  tone={st === 'next' ? 'muted' : st === 'problem' ? 'danger' : 'default'}
                  style={{ flex: 1, textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center',
                    fontFamily: st === 'now' ? t.fonts.bold : t.fonts.medium }}>
              {name}
            </Text>
          );
        })}
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
