import { IST, istDate, type OrderResponse } from '@lunchbox/api-client';
import {
  Banner,
  Chip,
  EmptyState,
  ListGroup,
  Loading,
  PressableScale,
  Row,
  Screen,
  SectionHeader,
  StatusPill,
  Text,
  TiffinArt,
  useTheme,
} from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Star } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useStatusLabels } from '../../src/hooks/useStatusLabels';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

function HistoryRow({ o, locale }: { o: OrderResponse; locale: string }) {
  const theme = useTheme();
  const router = useRouter();
  const labels = useStatusLabels();
  const date = new Date(`${o.scheduledDate}T12:00:00+05:30`);
  return (
    <PressableScale onPress={() => router.push(`/orders/${o.id}`)} scaleTo={0.985} accessibilityRole="button"
                    accessibilityLabel={`${o.childName}, ${istDate(o.scheduledDate)}, ${labels[o.status]}`}>
      <Row gap={3.5} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ width: 44, alignItems: 'center', paddingVertical: 4, borderRadius: 12, backgroundColor: theme.colors.sunken }}>
          <Text variant="overline" muted>{new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: IST }).format(date)}</Text>
          <Text variant="heading" style={{ fontFamily: theme.fonts.display, fontVariant: ['tabular-nums'] }}>
            {Number(o.scheduledDate.slice(8))}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodyStrong" numberOfLines={1}>{o.childName}</Text>
          <Row gap={2}>
            <StatusPill status={o.status} labels={labels} />
            {o.ratingStars ? (
              <Row gap={0.5}>
                <Star size={12} color={theme.colors.accent} fill={theme.colors.accent} />
                <Text variant="caption" muted>{o.ratingStars}</Text>
              </Row>
            ) : null}
          </Row>
        </View>
      </Row>
    </PressableScale>
  );
}

export default function OrderHistoryScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const [childId, setChildId] = useState<string | undefined>(undefined);
  const children = useQuery({ queryKey: ['children'], queryFn: api.children.list });
  const history = useQuery({
    queryKey: ['orders', 'history', childId ?? 'all'],
    queryFn: () => api.orders.history({ childId, page: 0, size: 60 }),
  });
  if (history.isLoading && !history.data) return <Loading label={t('common.loading')} />;

  const months = new Map<string, OrderResponse[]>();
  for (const o of history.data?.items ?? []) {
    const key = o.scheduledDate.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), o]);
  }
  const monthLabel = (key: string) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));

  return (
    <Screen refreshing={history.isRefetching} onRefresh={() => void history.refetch()}>
      {(children.data?.length ?? 0) > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label={t('history.all')} role="tab" selected={!childId} onPress={() => setChildId(undefined)} />
          {children.data!.map((c) => (
            <Chip key={c.id} label={c.firstName} role="tab" selected={childId === c.id} onPress={() => setChildId(c.id)} />
          ))}
        </ScrollView>
      ) : null}
      {history.error ? <Banner tone="danger">{errorMessage(history.error)}</Banner> : null}
      {history.data?.items.length === 0 ? (
        <EmptyState art={<TiffinArt size={88} mood="muted" />} title={t('history.emptyTitle')} message={t('history.emptyHint')} />
      ) : null}
      {[...months.entries()].map(([key, orders]) => (
        <View key={key} style={{ gap: 8 }}>
          <SectionHeader title={monthLabel(key)} action={<Text variant="caption" muted>{t('history.count', { count: orders.length })}</Text>} />
          <ListGroup>
            {orders.map((o) => <HistoryRow key={o.id} o={o} locale={locale} />)}
          </ListGroup>
        </View>
      ))}
    </Screen>
  );
}
