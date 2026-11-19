import { rupees, type ChildResponse, type PlanResponse, type SubscriptionResponse } from '@lunchbox/api-client';
import {
  Badge,
  Banner,
  Button,
  Card,
  Icon,
  ListGroup,
  ListItem,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Text,
  TiffinArt,
  useTheme,
} from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Check, ReceiptText, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { PlanPayment } from '../src/components/PlanPayment';
import { api } from '../src/lib/api';
import { errorMessage } from '../src/lib/queryClient';

const LIVE = ['ACTIVE', 'PENDING_PAYMENT', 'PAUSED', 'HALTED'];
const STATUS_TONE = { ACTIVE: 'primary', PENDING_PAYMENT: 'accent', PAUSED: 'neutral', HALTED: 'danger', CANCELLED: 'neutral',
  EXPIRED: 'neutral' } as const;

/** Each child's current plan (with renewal), the plans on offer, and the way to payment history and receipts. */
export default function PlansScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.plans.list });
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: api.subscriptions.list });
  const children = useQuery({ queryKey: ['children'], queryFn: api.children.list });

  if (plans.isLoading || subs.isLoading || children.isLoading) return <Loading label={t('common.loading')} />;
  const error = plans.error ?? subs.error ?? children.error;
  const current = (subs.data ?? []).filter((s) => LIVE.includes(s.status));
  const offered = (plans.data ?? []).filter((p) => p.active);
  const kids = children.data ?? [];

  function choose(plan: PlanResponse) {
    const free = kids.filter((c) => !current.some((s) => s.childId === c.id));
    const options = free.length > 0 ? free : kids;
    if (options.length === 0) {
      router.push('/children/new');
      return;
    }
    if (options.length === 1) {
      router.push({ pathname: '/subscribe/[childId]', params: { childId: options[0]!.id, planId: plan.id } });
      return;
    }
    Alert.alert(t('plans.forWhom'), plan.name, [
      ...options.map((c: ChildResponse) => ({
        text: c.firstName,
        onPress: () => router.push({ pathname: '/subscribe/[childId]', params: { childId: c.id, planId: plan.id } }),
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  }

  return (
    <Screen refreshing={plans.isRefetching || subs.isRefetching} gap={5}
            onRefresh={() => void Promise.all([plans.refetch(), subs.refetch(), children.refetch()])}>
      {error ? <Banner tone="danger" title={t('common.problem')}>{errorMessage(error)}</Banner> : null}

      <View style={{ gap: 8 }}>
        <SectionHeader title={t('plans.current')} />
        {current.length === 0 ? (
          // A slim note, not a full empty state: the plans to choose from are right below and should stay in view.
          <Card gap={0}>
            <Row gap={3}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.primarySoft,
                alignItems: 'center', justifyContent: 'center' }}>
                <TiffinArt size={28} mood="muted" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subheading">{t('plans.noneActive')}</Text>
                <Text variant="caption" muted>{t('plans.noneActiveHint')}</Text>
              </View>
            </Row>
          </Card>
        ) : (
          current.map((s) => <CurrentPlan key={s.id} sub={s} />)
        )}
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeader title={t('plans.available')} />
        {offered.map((p) => <PlanCard key={p.id} plan={p} onChoose={() => choose(p)} />)}
        <Row gap={2} style={{ paddingHorizontal: 4 }}>
          <Icon as={ShieldCheck} size={16} color="textMuted" />
          <Text variant="caption" muted style={{ flex: 1 }}>{t('plans.securePayment')}</Text>
        </Row>
      </View>

      <ListGroup>
        <ListItem icon={ReceiptText} iconTone="accent" title={t('plans.history')} subtitle={t('plans.historyHint')}
                  onPress={() => router.push('/payments')} />
      </ListGroup>
    </Screen>
  );
}

function CurrentPlan({ sub }: { sub: SubscriptionResponse }) {
  const { t } = useTranslation();
  return (
    <Card tone="raised" gap={3}>
      <Row justify="space-between" align="flex-start" gap={3}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="overline" muted>{sub.childName}</Text>
          <Text variant="title">{sub.planName}</Text>
          <Text variant="caption" muted>{rupees(sub.pricePaise)}</Text>
        </View>
        <Badge label={t(`account.subStatus.${sub.status}`)} tone={STATUS_TONE[sub.status]} />
      </Row>
      <PlanPayment sub={sub} />
    </Card>
  );
}

function PlanCard({ plan, onChoose }: { plan: PlanResponse; onChoose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const months = plan.billingPeriod === 'QUARTERLY' ? 3 : 1;
  return (
    <Card tone="raised" gap={3}>
      <Row justify="space-between" align="flex-start" gap={3}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title">{plan.name}</Text>
          <Text variant="caption" muted>{t('plans.validity', { count: months })} · {t('plans.daysPerWeek', { count: plan.maxDaysPerWeek })}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="figure" style={{ color: theme.colors.primary }}>{rupees(plan.pricePaise)}</Text>
          <Text variant="caption" muted>{t(months === 3 ? 'plans.perQuarter' : 'plans.perMonth')}</Text>
        </View>
      </Row>
      {plan.description ? <Text muted>{plan.description}</Text> : null}
      {plan.features.length > 0 ? (
        <View style={{ gap: 6 }} accessibilityRole="list">
          {plan.features.map((f) => (
            <Row key={f} gap={2}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.successSoft,
                alignItems: 'center', justifyContent: 'center' }}>
                <Check size={13} color={theme.colors.onSuccessSoft} strokeWidth={3} />
              </View>
              <Text style={{ flex: 1 }}>{f}</Text>
            </Row>
          ))}
        </View>
      ) : null}
      <Button title={t('plans.choose')} onPress={onChoose} testID={`choose-${plan.code}`} />
    </Card>
  );
}
