import { addDays, istDate, todayIst } from '@lunchbox/api-client';
import { Banner, Card, Loading, Row, Screen, Text, useTheme } from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

const HORIZON_DAYS = 30;

function weekday(date: string): string {
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' }).toUpperCase();
}

export default function CalendarScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const qc = useQueryClient();
  const children = useQuery({ queryKey: ['children'], queryFn: api.children.list });
  const [selected, setSelected] = useState<string | null>(null);
  const child = children.data?.find((c) => c.id === selected) ?? children.data?.[0];
  const from = addDays(todayIst(), 1);
  const to = addDays(todayIst(), HORIZON_DAYS);
  const dates = useMemo(() => Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(from, i)), [from]);

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
  const toggle = useMutation({
    mutationFn: async (date: string) => {
      const onLeave = leaves.data?.some((l) => l.date === date);
      if (onLeave) await api.children.removeLeave(child!.id, date);
      else await api.children.addLeave(child!.id, { date });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leaves', child?.id] }),
  });

  if (children.isLoading) return <Loading />;
  if (!child) return <Screen><Text>{t('calendar.chooseChild')}</Text></Screen>;

  const leaveSet = new Set(leaves.data?.map((l) => l.date));
  const holidayMap = new Map(holidays.data?.map((h) => [h.date, h.reason]));

  return (
    <Screen>
      <Text variant="title">{t('calendar.title')}</Text>
      <Text muted>{t('calendar.intro')}</Text>
      <Row style={{ flexWrap: 'wrap' }}>
        {children.data?.map((c) => (
          <Pressable key={c.id} accessibilityRole="tab" accessibilityState={{ selected: c.id === child.id }}
                     onPress={() => setSelected(c.id)} style={{ padding: 8 }}>
            <Text variant="label" muted={c.id !== child.id}>{c.firstName}</Text>
          </Pressable>
        ))}
      </Row>
      {toggle.error ? <Banner tone="danger">{errorMessage(toggle.error)}</Banner> : null}
      <Card>
        {dates.map((d) => {
          const day = weekday(d);
          const weekend = day === 'SUNDAY';
          const holiday = holidayMap.get(d);
          const onLeave = leaveSet.has(d);
          return (
            <Pressable
              key={d}
              disabled={weekend || !!holiday || toggle.isPending}
              onPress={() => toggle.mutate(d)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: onLeave, disabled: weekend || !!holiday }}
              accessibilityLabel={`${istDate(d)} ${onLeave ? t('calendar.onLeave') : ''}`}
              style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <Text muted={weekend}>{istDate(d)} · {t(`days.${day}`)}</Text>
                <View>
                  {holiday ? (
                    <Text variant="caption" muted>{t('calendar.holiday')}: {holiday}</Text>
                  ) : onLeave ? (
                    <Text variant="label" style={{ color: theme.colors.danger }}>{t('calendar.onLeave')}</Text>
                  ) : null}
                </View>
              </Row>
            </Pressable>
          );
        })}
      </Card>
    </Screen>
  );
}
