import { istDate, rupees, todayIst, type EarningsSummary, type PayoutResponse } from '@lunchbox/api-client';
import {
  Badge,
  Banner,
  Card,
  EmptyState,
  Icon,
  ListGroup,
  Loading,
  PageTitle,
  Row,
  Screen,
  SectionHeader,
  SegmentedControl,
  Text,
  TiffinArt,
  haptic,
  useTheme,
  type LucideIcon,
} from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, Gift, Landmark, MapPinned, Package, ReceiptText, Sun, TriangleAlert, Undo2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text as RNText, View } from 'react-native';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

const ENTRY_ICON: Record<string, LucideIcon> = {
  BASE_DAY: Sun,
  DELIVERY: Package,
  DISTANCE: MapPinned,
  INCENTIVE: Gift,
  PENALTY: TriangleAlert,
  ADJUSTMENT: ReceiptText,
  PAYOUT: Landmark,
  PAYOUT_REVERSAL: Undo2,
};
const PAYOUT_TONE = { PENDING: 'neutral', PROCESSING: 'info', PROCESSED: 'primary', FAILED: 'danger', REVERSED: 'danger' } as const;
const CHART_H = 132;

/**
 * Daily earnings columns: one series, so no legend. Only the peak carries a label; tapping a column reads its day
 * out above the plot, which doubles as the accessible value for that column.
 */
function DailyChart({ days, locale }: { days: EarningsSummary['days']; locale: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const today = todayIst();
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(1, ...days.map((d) => d.amountPaise));
  const peak = days.reduce<EarningsSummary['days'][number] | null>((best, d) => (!best || d.amountPaise > best.amountPaise ? d : best), null);
  const focus = days.find((d) => d.date === picked) ?? days.find((d) => d.date === today) ?? days[days.length - 1];
  const dense = days.length > 10;
  const weekday = (d: string) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

  return (
    <Card tone="raised" gap={3}>
      <View accessibilityLiveRegion="polite" style={{ minHeight: 40 }}>
        {focus ? (
          <>
            <Text variant="caption" muted>{istDate(focus.date)}</Text>
            <Text variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{rupees(focus.amountPaise)}</Text>
          </>
        ) : null}
      </View>
      <View style={{ height: CHART_H + 18 }}>
        {/* Peak reference: a recessive hairline with its value, standing in for a y-axis tick. */}
        {peak && peak.amountPaise > 0 ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 18, height: 1, backgroundColor: theme.colors.border }}>
            <RNText style={{ position: 'absolute', right: 0, top: -16, fontFamily: theme.fonts.medium, fontSize: 11,
              color: theme.colors.textMuted, fontVariant: ['tabular-nums'] }}>{rupees(peak.amountPaise)}</RNText>
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: theme.colors.borderStrong }} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2, paddingTop: 18 }}>
          {days.map((d) => {
            const on = d.date === focus?.date;
            const h = d.amountPaise > 0 ? Math.max(3, (d.amountPaise / max) * CHART_H) : 0;
            return (
              <Pressable
                key={d.date}
                onPress={() => { haptic.tap(); setPicked(d.date); }}
                accessibilityRole="button"
                accessibilityLabel={`${istDate(d.date)}: ${rupees(d.amountPaise)}`}
                style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' }}
                hitSlop={{ top: 8, bottom: 8 }}
              >
                <View style={{ width: '72%', maxWidth: 24, height: h, borderTopLeftRadius: 4, borderTopRightRadius: 4,
                  backgroundColor: on ? theme.colors.primary : theme.colors.primarySoft }} />
              </Pressable>
            );
          })}
        </View>
      </View>
      {!dense ? (
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {days.map((d) => (
            <Text key={d.date} variant="caption" center muted={d.date !== focus?.date} style={{ flex: 1 }}>{weekday(d.date)}</Text>
          ))}
        </View>
      ) : (
        <Row justify="space-between">
          <Text variant="caption" muted>{days[0] ? istDate(days[0].date) : ''}</Text>
          <Text variant="caption" muted>{days.length > 0 ? istDate(days[days.length - 1]!.date) : ''}</Text>
        </Row>
      )}
      <Text variant="caption" tone="faint">{t('earnings.tapHint')}</Text>
    </Card>
  );
}

function PayoutRow({ p }: { p: PayoutResponse }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Row gap={3} style={{ paddingHorizontal: 16, paddingVertical: 14 }} accessible
         accessibilityLabel={`${istDate(p.periodStart)} – ${istDate(p.periodEnd)}, ${rupees(p.amountPaise)}, ${t(`earnings.payoutStatus.${p.status}`)}`}>
      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: theme.colors.sunken, alignItems: 'center', justifyContent: 'center' }}>
        <Icon as={Landmark} size={18} color="textMuted" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{istDate(p.periodStart)} – {istDate(p.periodEnd)}</Text>
        <Text variant="caption" muted numberOfLines={1}>
          {p.utr ? `UTR ${p.utr}` : p.failureReason ?? (p.processedAt ? istDate(p.processedAt) : t('earnings.inProgress'))}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 5 }}>
        <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{rupees(p.amountPaise)}</Text>
        <Badge label={t(`earnings.payoutStatus.${p.status}`)} tone={PAYOUT_TONE[p.status]} />
      </View>
    </Row>
  );
}

export default function EarningsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const earnings = useQuery({
    queryKey: ['earnings', mode],
    queryFn: () => (mode === 'week' ? api.partner.earnings() : api.partner.monthlyEarnings()),
  });
  const payouts = useQuery({ queryKey: ['payouts'], queryFn: () => api.partner.payouts(0) });

  const data = earnings.data;
  const workedDays = data?.days.filter((d) => d.amountPaise > 0).length ?? 0;

  return (
    <Screen safeTop refreshing={earnings.isRefetching} onRefresh={() => { void earnings.refetch(); void payouts.refetch(); }}>
      <PageTitle title={t('earnings.title')} />
      <SegmentedControl options={[{ value: 'week', label: t('earnings.week') }, { value: 'month', label: t('earnings.month') }]}
                        value={mode} onChange={setMode} />
      {earnings.error ? <Banner tone="danger" title={t('common.problem')}>{errorMessage(earnings.error)}</Banner> : null}
      {earnings.isLoading ? <Loading cards={2} label={t('common.loading')} /> : null}

      {data ? (
        <>
          <Card tone="brand" gap={4}>
            <View style={{ gap: 2 }}>
              <Text variant="overline" tone="onPrimary" style={{ opacity: 0.85 }}>{mode === 'week' ? t('earnings.week') : t('earnings.month')}</Text>
              {/* The hero figure: sans, proportional figures, one per view. */}
              <Text variant="figure" tone="onPrimary">{rupees(data.earnedPaise)}</Text>
              <Text variant="caption" tone="onPrimary" style={{ opacity: 0.85 }}>
                {t('earnings.workedDays', { count: workedDays })}
              </Text>
            </View>
            <Row justify="space-between" style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: theme.radius.md, padding: 12 }}>
              <Row gap={2}>
                <ArrowDownLeft size={16} color={theme.colors.onPrimary} />
                <Text variant="label" tone="onPrimary">{t('earnings.balance')}</Text>
              </Row>
              <Text variant="bodyStrong" tone="onPrimary" style={{ fontVariant: ['tabular-nums'] }}>{rupees(data.balancePaise)}</Text>
            </Row>
          </Card>

          {data.days.length > 0 ? <DailyChart days={data.days} locale={locale} /> : null}

          {data.entries.length > 0 ? (
            <View style={{ gap: 8 }}>
              <SectionHeader title={t('earnings.breakdown')} />
              <ListGroup>
                {data.entries.slice(0, 50).map((e) => {
                  const negative = e.amountPaise < 0;
                  return (
                    <Row key={e.id} gap={3} style={{ paddingHorizontal: 16, paddingVertical: 12 }} accessible
                         accessibilityLabel={`${istDate(e.earningDate)}, ${e.description}, ${rupees(e.amountPaise)}`}>
                      <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: negative ? theme.colors.dangerSoft : theme.colors.primarySoft }}>
                        <Icon as={ENTRY_ICON[e.type] ?? ReceiptText} size={16} color={negative ? 'onDangerSoft' : 'onPrimarySoft'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="body" numberOfLines={1}>{e.description}</Text>
                        <Text variant="caption" muted>{istDate(e.earningDate)}</Text>
                      </View>
                      <Text variant="bodyStrong" tone={negative ? 'danger' : 'default'} style={{ fontVariant: ['tabular-nums'] }}>
                        {negative ? '−' : '+'}{rupees(Math.abs(e.amountPaise))}
                      </Text>
                    </Row>
                  );
                })}
              </ListGroup>
            </View>
          ) : (
            <EmptyState art={<TiffinArt size={80} mood="muted" />} title={t('earnings.emptyTitle')} message={t('earnings.emptyHint')} />
          )}
        </>
      ) : null}

      <SectionHeader title={t('earnings.payouts')} />
      {payouts.data?.items.length === 0 ? <Text muted>{t('earnings.noPayouts')}</Text> : null}
      {payouts.data && payouts.data.items.length > 0 ? (
        <ListGroup>
          {payouts.data.items.map((p) => <PayoutRow key={p.id} p={p} />)}
        </ListGroup>
      ) : null}
    </Screen>
  );
}
