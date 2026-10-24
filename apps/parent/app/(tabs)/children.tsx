import type { ChildResponse, SubscriptionResponse } from '@lunchbox/api-client';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Loading,
  PageTitle,
  PressableScale,
  Row,
  Screen,
  Text,
  TiffinArt,
  useTheme,
} from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronRight, Plus, School, TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

const LIVE = ['ACTIVE', 'PENDING_PAYMENT', 'PAUSED', 'HALTED'];
const WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

function ChildCard({ child, sub }: { child: ChildResponse; sub?: SubscriptionResponse }) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const fullName = [child.firstName, child.lastName].filter(Boolean).join(' ');
  const classLine = [
    `${t('children.className')} ${child.className}${child.section ? `-${child.section}` : ''}`,
    child.rollNumber ? t('children.roll', { roll: child.rollNumber }) : null,
  ].filter(Boolean).join(' · ');
  const days = new Set<string>(sub?.daysOfWeek ?? []);
  const badge = !sub
    ? null
    : sub.status === 'ACTIVE'
      ? { label: t('children.planActive'), tone: 'primary' as const }
      : sub.status === 'PENDING_PAYMENT'
        ? { label: t('children.planPending'), tone: 'accent' as const }
        : { label: t('children.planPaused'), tone: 'neutral' as const };

  return (
    <Card tone="raised" padding={0}>
      <PressableScale onPress={() => router.push(`/children/${child.id}`)} scaleTo={0.985} accessibilityRole="button"
                      accessibilityLabel={`${fullName}, ${child.schoolName}`} accessibilityHint={t('children.edit')}>
        <View style={{ padding: 18, gap: 14 }}>
          <Row gap={3.5}>
            <Avatar name={fullName} size={56} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="heading" numberOfLines={1}>{fullName}</Text>
              <Text variant="caption" muted>{classLine}</Text>
              <Row gap={1.5}>
                <Icon as={School} size={13} color="textFaint" />
                <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>{child.schoolName}</Text>
              </Row>
            </View>
            <Icon as={ChevronRight} size={20} color="textFaint" />
          </Row>
          {child.allergiesNote ? (
            <Row gap={2} align="flex-start" style={{ backgroundColor: theme.colors.accentSoft, borderRadius: theme.radius.sm, padding: 10 }}>
              <Icon as={TriangleAlert} size={15} color="onAccentSoft" />
              <Text variant="caption" style={{ flex: 1, color: theme.colors.onAccentSoft }} numberOfLines={2}>
                {child.allergiesNote}
              </Text>
            </Row>
          ) : null}
        </View>
      </PressableScale>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingHorizontal: 18, paddingVertical: 14 }}>
        {sub && badge ? (
          <View style={{ gap: 10 }}>
            <Row justify="space-between">
              <Text variant="label">{sub.planName}</Text>
              <Badge label={badge.label} tone={badge.tone} />
            </Row>
            <Row gap={1.5} accessible accessibilityLabel={t('children.pickupDays', {
              days: WEEK.filter((d) => days.has(d)).map((d) => t(`days.${d}`)).join(', '),
            })}>
              {WEEK.map((d) => {
                const on = days.has(d);
                return (
                  <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: theme.radius.sm,
                    backgroundColor: on ? theme.colors.primarySoft : theme.colors.sunken }}>
                    <Text variant="caption" style={{ color: on ? theme.colors.onPrimarySoft : theme.colors.textFaint,
                      fontFamily: on ? theme.fonts.bold : theme.fonts.medium }}>
                      {t(`days.${d}`)}
                    </Text>
                  </View>
                );
              })}
            </Row>
          </View>
        ) : (
          <Row gap={3}>
            <Text variant="caption" muted style={{ flex: 1 }}>{t('children.noPlan')}</Text>
            <Button title={t('children.subscribe')} size="sm" inline onPress={() => router.push(`/subscribe/${child.id}`)}
                    testID={`subscribe-${child.id}`} />
          </Row>
        )}
      </View>
    </Card>
  );
}

export default function ChildrenScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const children = useQuery({ queryKey: ['children'], queryFn: api.children.list });
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: api.subscriptions.list });

  if (children.isLoading) return <Loading safeTop label={t('common.loading')} />;
  const byChild = new Map((subs.data ?? []).filter((s) => LIVE.includes(s.status)).map((s) => [s.childId, s]));
  const list = children.data ?? [];

  return (
    <Screen safeTop refreshing={children.isRefetching} onRefresh={() => {
      void children.refetch();
      void subs.refetch();
    }}>
      <PageTitle
        title={t('children.title')}
        subtitle={list.length > 0 ? t('children.count', { count: list.length }) : undefined}
        trailing={list.length > 0 ? (
          <IconButton icon={Plus} label={t('children.add')} tone="primary" onPress={() => router.push('/children/new')} />
        ) : undefined}
      />
      {children.error ? <Banner tone="danger" title={t('common.problem')}>{errorMessage(children.error)}</Banner> : null}

      {list.length === 0 && !children.error ? (
        <EmptyState
          art={<TiffinArt size={104} steam />}
          title={t('children.emptyTitle')}
          message={t('children.emptyHint')}
          action={<Button title={t('children.add')} icon={Plus} onPress={() => router.push('/children/new')} testID="add-child" />}
        />
      ) : (
        <>
          {list.map((c) => <ChildCard key={c.id} child={c} sub={byChild.get(c.id)} />)}
          <PressableScale onPress={() => router.push('/children/new')} accessibilityRole="button"
                          accessibilityLabel={t('children.add')} testID="add-child">
            <Row gap={2} justify="center" style={{ paddingVertical: 18, borderRadius: theme.radius.lg, borderWidth: 1.5,
              borderStyle: 'dashed', borderColor: theme.colors.borderStrong }}>
              <Icon as={Plus} size={18} color="primary" />
              <Text variant="label" tone="primary">{t('children.addAnother')}</Text>
            </Row>
          </PressableScale>
        </>
      )}
    </Screen>
  );
}
