import { addDays, clockTime, istDate, sortDays, todayIst, type CalendarDay } from '@lunchbox/api-client';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  Loading,
  PageTitle,
  Row,
  Screen,
  Text,
  TiffinArt,
  haptic,
  useTheme,
  useToast,
} from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useStatusLabels } from '../../src/hooks/useStatusLabels';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

const HORIZON_DAYS = 45;
const WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const DONE = new Set(['DELIVERED']);
const PROBLEM = new Set(['CANCELLED', 'PICKUP_FAILED', 'DELIVERY_FAILED']);

/** Monday-first weekday index (0 = Monday) of a yyyy-MM-dd calendar date. */
function weekIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

interface Month {
  key: string;
  label: string;
  cells: (string | null)[];
}

/** Calendar months covering [first, last], each padded to whole Monday-first weeks. */
function monthsBetween(first: string, last: string, locale: string): Month[] {
  const months: Month[] = [];
  let cursor = `${first.slice(0, 7)}-01`;
  while (cursor <= last) {
    const key = cursor.slice(0, 7);
    const cells: (string | null)[] = Array.from({ length: weekIndex(cursor) }, () => null);
    let d = cursor;
    while (d.slice(0, 7) === key) {
      cells.push(d);
      d = addDays(d, 1);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    months.push({
      key,
      label: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${cursor}T00:00:00Z`)),
      cells,
    });
    cursor = d;
  }
  return months;
}

/**
 * The child's calendar as the server works it out (school days, holidays, plan days and dates, leave, payment), so
 * it always matches the orders that will be created. Pickup days can be tapped to skip them until the cut-off.
 */
export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const statusLabel = useStatusLabels();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const children = useQuery({ queryKey: ['children'], queryFn: api.children.list });
  const [selected, setSelected] = useState<string | null>(null);
  const child = children.data?.find((c) => c.id === selected) ?? children.data?.[0];
  const today = todayIst();
  const from = today;
  const to = addDays(today, HORIZON_DAYS);
  const months = useMemo(() => monthsBetween(addDays(from, 1), to, locale), [from, to, locale]);

  const calendar = useQuery({
    queryKey: ['calendar', child?.id, from],
    queryFn: () => api.children.calendar(child!.id, from, to),
    enabled: !!child,
  });
  const byDate = useMemo(() => new Map((calendar.data?.days ?? []).map((d) => [d.date, d])), [calendar.data]);

  const toggle = useMutation({
    mutationFn: async (day: CalendarDay) => {
      if (day.state === 'LEAVE') await api.children.removeLeave(child!.id, day.date);
      else await api.children.addLeave(child!.id, { date: day.date });
      return day.state !== 'LEAVE';
    },
    onSuccess: async (nowOnLeave, day) => {
      haptic.tap();
      toast(nowOnLeave ? t('calendar.leaveAdded', { date: istDate(day.date) }) : t('calendar.leaveRemoved', { date: istDate(day.date) }));
      // Everything that shows this child's days: the calendar, Today and the order history.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['calendar', child?.id] }),
        qc.invalidateQueries({ queryKey: ['leaves', child?.id] }),
        qc.invalidateQueries({ queryKey: ['orders'] }),
      ]);
    },
  });

  if (children.isLoading) return <Loading safeTop label={t('common.loading')} />;
  if (!child) {
    return (
      <Screen safeTop>
        <PageTitle title={t('calendar.title')} />
        <EmptyState art={<TiffinArt size={70} mood="muted" />} title={t('calendar.chooseChild')} message={t('calendar.noChildren')}
                    action={<Button title={t('today.setup.addChild')} icon={Plus} onPress={() => router.push('/children/new')} />} />
      </Screen>
    );
  }

  const cal = calendar.data;
  const leaveCount = (cal?.days ?? []).filter((d) => d.state === 'LEAVE').length;

  const look = (day: CalendarDay | undefined): { bg: string; fg: string; border: string; dot?: string; strike?: boolean } => {
    const c = theme.colors;
    if (!day) return { bg: 'transparent', fg: c.textFaint, border: 'transparent' };
    switch (day.state) {
      case 'PICKUP':
        return { bg: c.surface, fg: c.text, border: c.border, dot: c.primary };
      case 'ORDER':
        if (day.orderStatus && DONE.has(day.orderStatus)) return { bg: c.primarySoft, fg: c.onPrimarySoft, border: 'transparent' };
        if (day.orderStatus && PROBLEM.has(day.orderStatus)) return { bg: 'transparent', fg: c.textFaint, border: c.border, strike: true };
        return { bg: c.surface, fg: c.text, border: c.primary, dot: c.accent };
      case 'LEAVE':
        return { bg: c.dangerSoft, fg: c.onDangerSoft, border: c.danger, strike: true };
      case 'HOLIDAY':
        return { bg: c.accentSoft, fg: c.onAccentSoft, border: 'transparent' };
      case 'RENEW_TO_CONTINUE':
        return { bg: 'transparent', fg: c.text, border: c.accent };
      default:
        return { bg: 'transparent', fg: c.textFaint, border: 'transparent' };
    }
  };

  const describe = (day: CalendarDay | undefined): string => {
    if (!day) return '';
    switch (day.state) {
      case 'PICKUP':
        return t('calendar.legendPickup');
      case 'ORDER':
        return day.orderStatus ? `${statusLabel[day.orderStatus]}${day.note ? ` (${day.note})` : ''}` : t('calendar.ordered');
      case 'LEAVE':
        return t('calendar.onLeave');
      case 'HOLIDAY':
        return `${t('calendar.holiday')}: ${day.note ?? ''}`;
      case 'RENEW_TO_CONTINUE':
        return t('calendar.renew');
      case 'NOT_A_PLAN_DAY':
        return t('calendar.notPlanDay');
      case 'NO_SCHOOL':
        return t('calendar.noSchool');
      case 'BEFORE_START':
        return t('calendar.beforeStart');
      case 'PLAN_ENDED':
        return t('calendar.planEnded');
      default:
        return t('calendar.noPlan');
    }
  };

  return (
    <Screen safeTop refreshing={calendar.isRefetching} onRefresh={() => void calendar.refetch()}>
      <PageTitle title={t('calendar.title')} subtitle={t('calendar.intro')} />

      {(children.data?.length ?? 0) > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {children.data!.map((c) => (
            <Chip key={c.id} label={c.firstName} role="tab" selected={c.id === child.id} onPress={() => setSelected(c.id)} />
          ))}
        </ScrollView>
      ) : null}

      {cal ? (
        <Card tone="sunken" gap={1}>
          <Text variant="bodyStrong">{cal.schoolName}</Text>
          <Text variant="caption" muted>
            {t('calendar.timings', {
              from: clockTime(cal.pickupWindowStart, locale),
              to: clockTime(cal.pickupWindowEnd, locale),
              by: clockTime(cal.deliveryDeadline, locale),
            })}
          </Text>
          <Text variant="caption" muted>
            {cal.planName
              ? t('calendar.planDays', { days: sortDays(cal.planDays).map((d) => t(`days.${d}`)).join(', ') })
              : t('calendar.noPlanHint')}
          </Text>
        </Card>
      ) : null}

      <Row gap={4} wrap>
        <Legend swatch={<View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.primary }} />}
                label={t('calendar.legendPickup')} />
        <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: theme.colors.dangerSoft,
          borderWidth: 1.5, borderColor: theme.colors.danger }} />} label={t('calendar.onLeave')} />
        <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: theme.colors.accentSoft }} />}
                label={t('calendar.holiday')} />
        <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 4, borderWidth: 1.5, borderColor: theme.colors.accent }} />}
                label={t('calendar.legendRenew')} />
      </Row>

      {toggle.error ? <Banner tone="danger">{errorMessage(toggle.error)}</Banner> : null}
      {calendar.error ? <Banner tone="danger">{errorMessage(calendar.error)}</Banner> : null}
      {calendar.isLoading ? <Loading label={t('common.loading')} /> : null}

      {cal ? months.map((m) => (
        <Card key={m.key} tone="raised" gap={3}>
          <Text variant="subheading" style={{ fontFamily: theme.fonts.display, fontSize: 19 }}>{m.label}</Text>
          <View style={{ flexDirection: 'row' }}>
            {WEEK.map((d) => (
              <Text key={d} variant="overline" muted center style={{ flex: 1 }}>{t(`days.${d}`)}</Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {m.cells.map((d, i) => {
              if (!d) return <View key={`${m.key}-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
              const day = byDate.get(d);
              const { bg, fg, border, dot, strike } = look(day);
              const pending = toggle.isPending && toggle.variables?.date === d;
              const toggleable = !!day?.editable && (day.state === 'PICKUP' || day.state === 'LEAVE');
              const informative = !!day && (day.state === 'HOLIDAY' || day.state === 'ORDER' || day.state === 'RENEW_TO_CONTINUE'
                || ((day.state === 'PICKUP' || day.state === 'LEAVE') && !day.editable));
              return (
                <View key={d} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }}>
                  <Pressable
                    disabled={!(toggleable || informative) || toggle.isPending}
                    onPress={() => {
                      if (!day) return;
                      if (toggleable) {
                        toggle.mutate(day);
                        return;
                      }
                      haptic.tap();
                      const closed = (day.state === 'PICKUP' || day.state === 'LEAVE') && !day.editable;
                      toast(closed ? t('calendar.closed') : describe(day), 'info');
                      if (day.state === 'RENEW_TO_CONTINUE') router.push('/plans');
                    }}
                    accessibilityRole={toggleable ? 'checkbox' : 'button'}
                    accessibilityState={toggleable ? { checked: day?.state === 'LEAVE', busy: pending } : undefined}
                    accessibilityLabel={`${istDate(d, locale)}, ${describe(day)}`}
                    testID={`day-${d}`}
                    style={({ pressed }) => ({
                      flex: 1,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      backgroundColor: bg,
                      borderWidth: border === 'transparent' ? 0 : day?.state === 'LEAVE' || day?.state === 'ORDER' ? 1.5 : 1,
                      borderColor: border,
                      opacity: pending ? 0.45 : pressed ? 0.7 : 1,
                      transform: [{ scale: pressed ? 0.94 : 1 }],
                    })}
                  >
                    <Text variant="label" style={{ color: fg, fontVariant: ['tabular-nums'], textDecorationLine: strike ? 'line-through' : 'none' }}>
                      {Number(d.slice(8))}
                    </Text>
                    {dot ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dot }} /> : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Card>
      )) : null}

      <Text variant="caption" muted center>
        {leaveCount > 0 ? t('calendar.leaveCount', { count: leaveCount, name: child.firstName }) : t('calendar.noLeave', { name: child.firstName })}
      </Text>
    </Screen>
  );
}

function Legend({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <Row gap={1.5}>
      <View style={{ width: 12, alignItems: 'center' }}>{swatch}</View>
      <Text variant="caption" muted>{label}</Text>
    </Row>
  );
}
