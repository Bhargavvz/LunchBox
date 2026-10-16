import { Text as RNText, View } from 'react-native';
import { useTheme } from './theme';
import { Text } from './components';

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

export function StatusPill({ status, labels = defaultStatusLabels }: { status: OrderStatusName; labels?: StatusLabels }) {
  const t = useTheme();
  const tone =
    status === 'DELIVERED'
      ? [t.colors.primarySoft, t.colors.primary]
      : status === 'CANCELLED'
        ? [t.colors.background, t.colors.textMuted]
        : status.endsWith('FAILED')
          ? [t.colors.dangerSoft, t.colors.danger]
          : [t.colors.infoSoft, t.colors.info];
  return (
    <View
      accessibilityLabel={`Status: ${labels[status]}`}
      style={{ alignSelf: 'flex-start', backgroundColor: tone[0], borderRadius: t.radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}
    >
      <RNText style={{ color: tone[1], fontSize: t.font.xs, fontWeight: '700' }}>{labels[status]}</RNText>
    </View>
  );
}

const JOURNEY: OrderStatusName[] = ['ASSIGNED', 'PARTNER_EN_ROUTE', 'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL', 'DELIVERED'];

/** Vertical journey timeline; steps reached show their time. */
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
  return (
    <View accessibilityRole="list" style={{ gap: t.spacing(2) }}>
      {JOURNEY.map((step, i) => {
        const at = reached.get(step);
        const done = at !== undefined;
        return (
          <View key={step} style={{ flexDirection: 'row', gap: t.spacing(3), alignItems: 'flex-start' }}>
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: done ? t.colors.primary : t.colors.border,
                  marginTop: 3,
                }}
              />
              {i < JOURNEY.length - 1 ? (
                <View style={{ width: 2, height: 22, backgroundColor: done ? t.colors.primary : t.colors.border }} />
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" muted={!done}>
                {labels[step]}
              </Text>
              {at ? (
                <Text variant="caption" muted>
                  {formatTime(at)}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {failed ? (
        <Text variant="label" style={{ color: t.colors.danger }}>
          {labels[current]}
        </Text>
      ) : null}
    </View>
  );
}
