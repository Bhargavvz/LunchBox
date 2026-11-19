import { istDate, sortDays, type Weekday } from '@lunchbox/api-client';
import { Banner, Button, Card, PressableScale, Row, Text, haptic, useTheme, useToast } from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '../lib/api';
import { errorMessage } from '../lib/queryClient';
import { useSchoolDetails } from './SchoolInfo';

const LIVE = ['ACTIVE', 'PENDING_PAYMENT', 'PAUSED', 'HALTED'];

/**
 * Lets a parent change which school days lunch is picked up, within the school's working days and the plan's limits.
 * This is how a Saturday the school starts working shows up for an existing plan.
 */
export function PickupDaysEditor({ childId, schoolId }: { childId: string; schoolId: string }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: api.subscriptions.list });
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.plans.list });
  const school = useSchoolDetails(schoolId);
  const sub = (subs.data ?? []).find((s) => s.childId === childId && LIVE.includes(s.status));
  const plan = plans.data?.find((p) => p.id === sub?.planId);
  const [days, setDays] = useState<Weekday[]>([]);

  useEffect(() => {
    if (sub) setDays(sortDays(sub.daysOfWeek) as Weekday[]);
  }, [sub]);

  const save = useMutation({
    mutationFn: () => api.subscriptions.updateSchedule(sub!.id, { addressId: sub!.addressId, daysOfWeek: days }),
    onSuccess: async () => {
      haptic.success();
      toast(t('children.daysSaved'));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['subscriptions'] }),
        qc.invalidateQueries({ queryKey: ['calendar', childId] }),
      ]);
    },
  });

  if (!sub || !school.data) return null;
  const allowedRaw = plan?.entitlements?.allowed_days as unknown;
  const allowed = Array.isArray(allowedRaw) ? new Set(allowedRaw as string[]) : null;
  const schoolDays = sortDays(school.data.workingDays) as Weekday[];
  const offered = schoolDays.filter((d) => !allowed || allowed.has(d));
  const missing = offered.filter((d) => !sub.daysOfWeek.includes(d));
  const max = plan?.maxDaysPerWeek ?? 7;
  const changed = sortDays(sub.daysOfWeek).join() !== days.join();
  const tooMany = days.length > max;

  return (
    <Card gap={3} testID="pickup-days">
      <Text variant="subheading">{t('children.pickupDaysTitle')}</Text>
      {missing.length > 0 ? (
        <Text variant="caption" muted>
          {t('children.schoolOpenMore', { school: school.data.name, days: missing.map((d) => t(`days.${d}`)).join(', ') })}
        </Text>
      ) : null}
      <Row gap={2}>
        {offered.map((d) => {
          const on = days.includes(d);
          return (
            <PressableScale key={d} style={{ flex: 1 }} scaleTo={0.92} accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }} accessibilityLabel={t(`days.${d}`)} testID={`pickup-day-${d}`}
                            onPress={() => {
                              haptic.tap();
                              setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : (sortDays([...cur, d]) as Weekday[])));
                            }}>
              <View style={{ paddingVertical: 12, alignItems: 'center', borderRadius: theme.radius.md, borderWidth: on ? 0 : 1,
                borderColor: theme.colors.border, backgroundColor: on ? theme.colors.primary : theme.colors.surface }}>
                <Text variant="label" style={{ color: on ? theme.colors.onPrimary : theme.colors.textMuted }}>{t(`days.${d}`)}</Text>
              </View>
            </PressableScale>
          );
        })}
      </Row>
      <Text variant="caption" muted>
        {t('children.planAllows', { count: max })} {t('children.pickupDaysHint', { date: istDate(school.data.firstBookableDate, locale) })}
      </Text>
      {tooMany ? <Banner tone="warning">{t('subscribe.tooManyDays', { count: max })}</Banner> : null}
      {save.error ? <Banner tone="danger">{errorMessage(save.error)}</Banner> : null}
      <Button title={t('children.saveDays')} variant="outline" onPress={() => save.mutate()} loading={save.isPending}
              disabled={!changed || days.length === 0 || tooMany} testID="save-pickup-days" />
    </Card>
  );
}
