import { addDays, istDate, todayIst } from '@lunchbox/api-client';
import {
  Banner,
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
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

const HORIZON_DAYS = 30;
const WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const LIVE = ['ACTIVE', 'PENDING_PAYMENT', 'PAUSED', 'HALTED'];

/** Monday-first weekday index (0 = Monday) of a yyyy-MM-dd calendar date. */
function weekIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

type DayState = 'outside' | 'off' | 'pickup' | 'leave' | 'holiday';

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

export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const children = useQuery({ queryKey: ['children'], queryFn: api.children.list });
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: api.subscriptions.list });
  const [selected, setSelected] = useState<string | null>(null);
  const child = children.data?.find((c) => c.id === selected) ?? children.data?.[0];
  const today = todayIst();
  const from = addDays(today, 1);
  const to = addDays(today, HORIZON_DAYS);
  const months = useMemo(() => monthsBetween(from, to, locale), [from, to, locale]);

  const leaves = useQuery({
    queryKey: ['leaves', child?.id, from],
    queryFn: () => api.children.leaveDays(child!.id, from, to),
    enabled: !!child,
  });
  const holidays = useQuery({
    queryKey: ['holidays', child?.schoolId, from],
    queryFn: () => api.schools.holidays(child!.schoolId, from, to),
    enabled: !!child,
  });
  const leaveSet = new Set(leaves.data?.map((l) => l.date));
  const toggle = useMutation({
    mutationFn: async (date: string) => {
      const onLeave = leaveSet.has(date);
      if (onLeave) await api.children.removeLeave(child!.id, date);
      else await api.children.addLeave(child!.id, { date });
      return !onLeave;
    },
    onSuccess: (nowOnLeave, date) => {
      toast(nowOnLeave ? t('calendar.leaveAdded', { date: istDate(date) }) : t('calendar.leaveRemoved', { date: istDate(date) }));
      return qc.invalidateQueries({ queryKey: ['leaves', child?.id] });
    },
  });

  if (children.isLoading) return <Loading safeTop label={t('common.loading')} />;
  if (!child) {
    return (
      <Screen safeTop>
        <PageTitle title={t('calendar.title')} />
        <EmptyState art={<TiffinArt size={92} mood="muted" />} title={t('calendar.chooseChild')} message={t('calendar.noChildren')} />
      </Screen>
    );
  }

  const holidayMap = new Map(holidays.data?.map((h) => [h.date, h.reason]));
  const sub = (subs.data ?? []).find((s) => s.childId === child.id && LIVE.includes(s.status));
  // With a plan, only its pickup days can be skipped; without one, any school day (Mon–Sat) can be marked ahead.
  const planDays = new Set<string>(sub?.daysOfWeek ?? WEEK.slice(0, 6));
  const stateOf = (d: string): DayState => {
    if (d < from || d > to) return 'outside';
    if (holidayMap.has(d)) return 'holiday';
    if (!planDays.has(WEEK[weekIndex(d)]!)) return 'off';
    return leaveSet.has(d) ? 'leave' : 'pickup';
  };
  const leaveCount = [...leaveSet].filter((d) => d >= from && d <= to).length;

  const cellColours = (s: DayState): { bg: string; fg: string; border: string } => {
    const c = theme.colors;
    switch (s) {
      case 'pickup':
        return { bg: c.surface, fg: c.text, border: c.border };
      case 'leave':
        return { bg: c.dangerSoft, fg: c.onDangerSoft, border: c.danger };
      case 'holiday':
        return { bg: c.accentSoft, fg: c.onAccentSoft, border: 'transparent' };
      default:
        return { bg: 'transparent', fg: c.textFaint, border: 'transparent' };
    }
  };

  return (
    <Screen safeTop refreshing={leaves.isRefetching} onRefresh={() => void leaves.refetch()}>
      <PageTitle title={t('calendar.title')} subtitle={t('calendar.intro')} />

      {(children.data?.length ?? 0) > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {children.data!.map((c) => (
            <Chip key={c.id} label={c.firstName} role="tab" selected={c.id === child.id} onPress={() => setSelected(c.id)} />
          ))}
        </ScrollView>
      ) : null}

      <Row gap={4} wrap>
        <Legend swatch={<View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.primary }} />}
                label={t('calendar.legendPickup')} />
        <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: theme.colors.dangerSoft,
          borderWidth: 1.5, borderColor: theme.colors.danger }} />} label={t('calendar.onLeave')} />
        <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: theme.colors.accentSoft }} />}
                label={t('calendar.holiday')} />
      </Row>

      {toggle.error ? <Banner tone="danger">{errorMessage(toggle.error)}</Banner> : null}
      {leaves.error ? <Banner tone="danger">{errorMessage(leaves.error)}</Banner> : null}

      {months.map((m) => (
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
              const state = stateOf(d);
              const { bg, fg, border } = cellColours(state);
              const pending = toggle.isPending && toggle.variables === d;
              const tappable = state === 'pickup' || state === 'leave';
              const label = `${istDate(d)}, ${
                state === 'leave' ? t('calendar.onLeave')
                  : state === 'holiday' ? `${t('calendar.holiday')}: ${holidayMap.get(d) ?? ''}`
                    : state === 'pickup' ? t('calendar.legendPickup') : t('calendar.noPickup')
              }`;
              return (
                <View key={d} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }}>
                  <Pressable
                    disabled={!(tappable || state === 'holiday') || toggle.isPending}
                    onPress={() => {
                      if (state === 'holiday') {
                        haptic.tap();
                        toast(`${t('calendar.holiday')}: ${holidayMap.get(d) ?? ''}`, 'info');
                        return;
                      }
                      toggle.mutate(d);
                    }}
                    accessibilityRole={tappable ? 'checkbox' : 'text'}
                    accessibilityState={tappable ? { checked: state === 'leave', busy: pending } : undefined}
                    accessibilityLabel={label}
                    testID={`day-${d}`}
                    style={({ pressed }) => ({
                      flex: 1,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      backgroundColor: bg,
                      borderWidth: state === 'leave' ? 1.5 : state === 'pickup' ? 1 : 0,
                      borderColor: border,
                      opacity: pending ? 0.45 : pressed ? 0.7 : 1,
                      transform: [{ scale: pressed ? 0.94 : 1 }],
                    })}
                  >
                    <Text variant="label" style={{ color: fg, fontVariant: ['tabular-nums'],
                      textDecorationLine: state === 'leave' ? 'line-through' : 'none' }}>
                      {Number(d.slice(8))}
                    </Text>
                    {state === 'pickup' ? (
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.primary }} />
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Card>
      ))}

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
