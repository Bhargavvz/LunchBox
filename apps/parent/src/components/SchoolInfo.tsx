import { clockRange, clockTime, istDate, sortDays, type SchoolDetails } from '@lunchbox/api-client';
import { Card, Icon, Row, Skeleton, Text, useTheme } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { CalendarOff, Clock, House, School } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '../lib/api';

export function useSchoolDetails(schoolId: string | null | undefined) {
  return useQuery({
    queryKey: ['school', schoolId],
    queryFn: () => api.schools.details(schoolId!),
    enabled: !!schoolId,
    staleTime: 10 * 60_000,
  });
}

/** Working days as a row of seven: open days filled, closed days faint, so Saturday (or Sunday) work shows at a glance. */
export function WeekStrip({ open }: { open: readonly string[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const set = new Set(open);
  const all = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  return (
    <Row gap={1} accessibilityLabel={sortDays(open).map((d) => t(`days.${d}`)).join(', ')}>
      {all.map((d) => {
        const on = set.has(d);
        return (
          <View key={d} style={{ flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center',
            backgroundColor: on ? theme.colors.primarySoft : 'transparent', borderWidth: on ? 0 : 1, borderColor: theme.colors.border }}>
            <Text variant="caption" style={{ color: on ? theme.colors.onPrimarySoft : theme.colors.textFaint }}>{t(`days.${d}`)}</Text>
          </View>
        );
      })}
    </Row>
  );
}

function Line({ icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <Row gap={3}>
      <Icon as={icon} size={18} color="textMuted" />
      <Text muted style={{ flex: 1 }}>{label}</Text>
      <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
    </Row>
  );
}

/** Everything a parent needs to know about the school's day: pickup window, deadline, lunch, open days, holidays. */
export function SchoolInfoCard({ school, compact = false }: { school: SchoolDetails; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const holidays = school.upcomingHolidays.slice(0, compact ? 2 : 4);
  return (
    <Card gap={3} testID="school-info">
      {!compact ? (
        <Row gap={2}>
          <Icon as={School} size={18} color="primary" />
          <Text variant="subheading" style={{ flex: 1 }}>{school.name}</Text>
        </Row>
      ) : null}
      <Line icon={House} label={t('school.pickup')} value={clockRange(school.pickupWindowStart, school.pickupWindowEnd, locale)} />
      <Line icon={School} label={t('school.atSchool')} value={clockTime(school.deliveryWindowEnd, locale)} />
      <Line icon={Clock} label={t('school.lunch')} value={clockTime(school.lunchTime, locale)} />
      <View style={{ gap: 6 }}>
        <Text variant="label" muted>{t('school.workingDays')}</Text>
        <WeekStrip open={school.workingDays} />
      </View>
      <View style={{ gap: 4 }}>
        <Text variant="label" muted>{t('school.holidays')}</Text>
        {holidays.length === 0 ? (
          <Text variant="caption" muted>{t('school.noHolidays')}</Text>
        ) : (
          holidays.map((h) => (
            <Row key={h.id} gap={2}>
              <Icon as={CalendarOff} size={14} color="textFaint" />
              <Text variant="caption" style={{ flex: 1 }}>{h.reason}</Text>
              <Text variant="caption" muted>{istDate(h.date, locale)}</Text>
            </Row>
          ))
        )}
      </View>
      {!compact ? <Text variant="caption" muted>{t('school.explain')}</Text> : null}
    </Card>
  );
}

export function SchoolInfoLoading() {
  return <Skeleton height={220} radius={16} />;
}
