import { addDays, istDate, istTime, todayIst, type NotificationResponse } from '@lunchbox/api-client';
import {
  Banner,
  Button,
  EmptyState,
  Icon,
  Loading,
  PageTitle,
  PressableScale,
  Row,
  Screen,
  SectionHeader,
  Text,
  TiffinArt,
  elevation,
  useTheme,
  type LucideIcon,
} from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Bell, Bike, CalendarX2, CircleAlert, CircleCheck, Megaphone, PackageCheck, School } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

type Tone = 'primary' | 'info' | 'danger' | 'accent' | 'neutral';

const CATEGORY: Record<string, { icon: LucideIcon; tone: Tone }> = {
  ORDER_EN_ROUTE: { icon: Bike, tone: 'info' },
  PARTNER_ARRIVING: { icon: Bike, tone: 'info' },
  ORDER_PICKED_UP: { icon: PackageCheck, tone: 'primary' },
  ORDER_AT_SCHOOL: { icon: School, tone: 'primary' },
  ORDER_DELIVERED: { icon: CircleCheck, tone: 'primary' },
  ORDER_PICKUP_FAILED: { icon: CircleAlert, tone: 'danger' },
  ORDER_DELIVERY_FAILED: { icon: CircleAlert, tone: 'danger' },
  ORDER_CANCELLED: { icon: CalendarX2, tone: 'neutral' },
  BROADCAST: { icon: Megaphone, tone: 'accent' },
};

function NotificationRow({ n, onPress }: { n: NotificationResponse; onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const c = theme.colors;
  const { icon, tone } = CATEGORY[n.category] ?? { icon: Bell, tone: 'neutral' as Tone };
  const [bg, fg] = {
    primary: [c.primarySoft, c.onPrimarySoft],
    info: [c.infoSoft, c.onInfoSoft],
    danger: [c.dangerSoft, c.onDangerSoft],
    accent: [c.accentSoft, c.onAccentSoft],
    neutral: [c.sunken, c.textMuted],
  }[tone] as [string, string];
  const unread = !n.readAt;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button"
                    accessibilityLabel={`${unread ? `${t('notifications.unreadPrefix')} ` : ''}${n.title}. ${n.body}`}>
      <Row gap={3} align="flex-start" style={{
        padding: 14,
        borderRadius: theme.radius.lg,
        backgroundColor: unread ? c.surface : 'transparent',
        borderWidth: 1,
        borderColor: unread ? c.border : 'transparent',
        ...(unread ? elevation(theme, 1) : null),
      }}>
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={icon} size={19} color={fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Row justify="space-between" align="flex-start" gap={2}>
            <Text variant={unread ? 'bodyStrong' : 'body'} style={{ flex: 1 }} numberOfLines={2}>{n.title}</Text>
            <Text variant="caption" tone="faint" style={{ paddingTop: 2, fontVariant: ['tabular-nums'] }}>{istTime(n.createdAt)}</Text>
          </Row>
          <Text variant="caption" muted numberOfLines={3}>{n.body}</Text>
        </View>
        {unread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent, marginTop: 6 }} /> : null}
      </Row>
    </PressableScale>
  );
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['notifications'], queryFn: () => api.notifications.list(0) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: ['unread'] });
  };
  const markAll = useMutation({ mutationFn: api.notifications.markAllRead, onSuccess: refresh });
  const markOne = useMutation({ mutationFn: api.notifications.markRead, onSuccess: refresh });

  if (list.isLoading) return <Loading safeTop label={t('common.loading')} />;
  const items = list.data?.items ?? [];
  const unread = items.filter((n) => !n.readAt).length;
  const today = todayIst();
  const yesterday = addDays(today, -1);
  const groups = new Map<string, NotificationResponse[]>();
  for (const n of items) {
    const day = todayIst(new Date(n.createdAt));
    groups.set(day, [...(groups.get(day) ?? []), n]);
  }

  return (
    <Screen safeTop refreshing={list.isRefetching} onRefresh={refresh}>
      <PageTitle
        title={t('notifications.title')}
        subtitle={unread > 0 ? t('notifications.unread', { count: unread }) : undefined}
        trailing={unread > 0 ? (
          <Button title={t('notifications.markAll')} variant="ghost" size="sm" inline loading={markAll.isPending}
                  onPress={() => markAll.mutate()} />
        ) : undefined}
      />
      {list.error ? <Banner tone="danger" title={t('common.problem')}>{errorMessage(list.error)}</Banner> : null}
      {list.data && items.length === 0 ? (
        <EmptyState art={<TiffinArt size={92} mood="muted" />} title={t('notifications.empty')} message={t('notifications.emptyHint')} />
      ) : null}
      {[...groups.entries()].map(([day, rows]) => (
        <View key={day} style={{ gap: 8 }}>
          <SectionHeader title={day === today ? t('notifications.today') : day === yesterday ? t('notifications.yesterday') : istDate(day)} />
          {rows.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              onPress={() => {
                if (!n.readAt) markOne.mutate(n.id);
                const orderId = n.data?.['orderId'];
                if (orderId) router.push(`/orders/${orderId}`);
              }}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}
