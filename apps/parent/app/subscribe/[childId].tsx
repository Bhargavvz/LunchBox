import {
  addDays,
  istDate,
  rupees,
  sortDays,
  weekdayOf,
  type PlanFeatureValue,
  type PlanResponse,
  type QuoteResponse,
  type Weekday,
} from '@lunchbox/api-client';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Icon,
  Loading,
  PressableScale,
  Row,
  Screen,
  SectionHeader,
  Text,
  TextField,
  TiffinArt,
  haptic,
  useTheme,
} from '@lunchbox/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, CircleCheck, Lock, MapPin, Plus, Ticket } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SchoolInfoCard, useSchoolDetails } from '../../src/components/SchoolInfo';
import { api } from '../../src/lib/api';
import { payAndVerify } from '../../src/lib/checkout';
import { errorMessage } from '../../src/lib/queryClient';

const WEEKS: Record<PlanResponse['billingPeriod'], number> = { MONTHLY: 52 / 12, QUARTERLY: 13 };
const FALLBACK_DAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/** Approximate price of one lunch for the chosen number of pickup days, for comparing plans honestly. */
function perLunchPaise(plan: PlanResponse, daysPerWeek: number): number {
  const days = Math.max(1, Math.min(daysPerWeek, plan.maxDaysPerWeek));
  return Math.round(plan.pricePaise / (days * WEEKS[plan.billingPeriod]));
}

/** The plan's allowed weekdays (feature "allowed_days"), or null when it allows every school day. */
function allowedDays(plan: PlanResponse | null): Set<string> | null {
  const v = plan?.entitlements?.allowed_days as unknown;
  return Array.isArray(v) ? new Set(v as string[]) : null;
}

function Radio({ on }: { on: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 0 : 1.5, borderColor: theme.colors.borderStrong,
      backgroundColor: on ? theme.colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {on ? <Check size={14} color={theme.colors.onPrimary} strokeWidth={3} /> : null}
    </View>
  );
}

/** One plan feature as a short line: "Live tracking", "Children on this plan: 2", "Pickup days allowed: Mon–Fri". */
export function featureText(f: PlanFeatureValue, t: (k: string) => string): string {
  const v = f.value as unknown;
  if (f.valueType === 'BOOLEAN') return v === true ? f.label : `${f.label}: ${t('plans.featureNo')}`;
  if (f.valueType === 'DAYS' && Array.isArray(v)) return `${f.label}: ${sortDays(v as string[]).map((d) => t(`days.${d}`)).join(', ')}`;
  if (f.valueType === 'MONEY' && typeof v === 'number') return `${f.label}: ${rupees(v)}`;
  return `${f.label}: ${String(v)}`;
}

export default function SubscribeScreen() {
  const { childId, planId: preselected } = useLocalSearchParams<{ childId: string; planId?: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const theme = useTheme();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const child = useQuery({ queryKey: ['child', childId], queryFn: () => api.children.get(childId) });
  const school = useSchoolDetails(child.data?.schoolId);
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.plans.list });
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: api.addresses.list });
  const [planId, setPlanId] = useState<string | null>(preselected ?? null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [days, setDays] = useState<Weekday[] | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<QuoteResponse | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ trialEndsAt?: string | null } | null>(null);

  const activePlans = (plans.data ?? []).filter((p) => p.active);
  const plan = activePlans.find((p) => p.id === planId) ?? null;
  const schoolDays: Weekday[] = school.data ? (sortDays(school.data.workingDays) as Weekday[]) : FALLBACK_DAYS;
  const allowed = allowedDays(plan);
  const offered = schoolDays.filter((d) => !allowed || allowed.has(d));

  // Start dates: the next school days on or after the first bookable date, skipping announced holidays.
  const startOptions = useMemo(() => {
    if (!school.data) return [];
    const holidays = new Set(school.data.upcomingHolidays.map((h) => h.date));
    const out: string[] = [];
    for (let i = 0; i < 21 && out.length < 8; i++) {
      const d = addDays(school.data.firstBookableDate, i);
      if (school.data.workingDays.includes(weekdayOf(d)) && !holidays.has(d)) out.push(d);
    }
    return out;
  }, [school.data]);

  // Defaults once the school is known: its working days (up to five) and its first school day.
  useEffect(() => {
    if (school.data && days === null) setDays((sortDays(school.data.workingDays) as Weekday[]).slice(0, 5));
  }, [school.data, days]);
  useEffect(() => {
    if (!startDate && startOptions[0]) setStartDate(startOptions[0]);
  }, [startOptions, startDate]);

  // Price for this parent: trial eligibility and any coupon.
  const quote = useQuery({
    queryKey: ['quote', planId],
    queryFn: () => api.subscriptions.quote({ planId: planId! }),
    enabled: !!planId,
  });
  useEffect(() => {
    setCoupon(null);
    setCouponError(null);
  }, [planId]);

  if (plans.isLoading || addresses.isLoading || child.isLoading) return <Loading label={t('common.loading')} />;
  const chosenDays = (days ?? []).filter((d) => offered.includes(d));
  const effectiveAddress = addressId ?? addresses.data?.find((a) => a.isDefault)?.id ?? addresses.data?.[0]?.id ?? null;
  const bestValue = activePlans.length > 1
    ? activePlans.reduce((best, p) => (perLunchPaise(p, chosenDays.length) < perLunchPaise(best, chosenDays.length) ? p : best)).id
    : null;
  const tooManyDays = !!plan && chosenDays.length > plan.maxDaysPerWeek;
  const trialDays = quote.data?.trialDays ?? 0;
  const payable = coupon ? coupon.payablePaise : plan?.pricePaise ?? 0;
  const childName = child.data?.firstName ?? '';
  const dayTile = (d: string) => {
    const date = new Date(`${d}T12:00:00+05:30`);
    return {
      weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(date),
      day: new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'Asia/Kolkata' }).format(date),
      month: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'Asia/Kolkata' }).format(date),
    };
  };

  async function applyCoupon() {
    if (!planId || !couponInput.trim()) return;
    setCheckingCoupon(true);
    setCouponError(null);
    try {
      const q = await api.subscriptions.quote({ planId, couponCode: couponInput.trim() });
      setCoupon(q);
      haptic.success();
    } catch (e) {
      setCoupon(null);
      setCouponError(errorMessage(e));
    } finally {
      setCheckingCoupon(false);
    }
  }

  async function pay() {
    if (!plan || !effectiveAddress || !startDate) return;
    setBusy(true);
    setError(null);
    try {
      const checkout = await api.subscriptions.create({
        childId,
        planId: plan.id,
        addressId: effectiveAddress,
        daysOfWeek: chosenDays,
        startDate,
        couponCode: coupon?.couponCode ?? undefined,
      });
      // A free trial starts straight away: there is nothing to pay yet.
      if (!checkout.trialEndsAt) await payAndVerify(checkout, theme.colors.primary);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['subscriptions'] }),
        qc.invalidateQueries({ queryKey: ['calendar'] }),
      ]);
      haptic.success();
      setDone({ trialEndsAt: checkout.trialEndsAt });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen footer={<Button title={t('common.done')} size="lg" onPress={() => router.replace('/(tabs)')} />}>
        <View style={{ alignItems: 'center', gap: 16, paddingTop: 48 }}>
          <View>
            <TiffinArt size={120} steam />
            <View style={{ position: 'absolute', right: -6, bottom: 4, borderRadius: 20, backgroundColor: theme.colors.background, padding: 3 }}>
              <CircleCheck size={34} color={theme.colors.surface} fill={theme.colors.primary} />
            </View>
          </View>
          <Text variant="display" center>{t('subscribe.allSet')}</Text>
          <Text muted center style={{ maxWidth: 300 }}>
            {done.trialEndsAt
              ? t('subscribe.trialStarted', { date: istDate(done.trialEndsAt, locale) })
              : t('subscribe.success', { date: istDate(startDate, locale) })}
          </Text>
        </View>
        {plan ? (
          <Card tone="sunken" gap={3}>
            <Row justify="space-between"><Text muted>{t('subscribe.summary.plan')}</Text><Text variant="bodyStrong">{plan.name}</Text></Row>
            <Row justify="space-between"><Text muted>{t('subscribe.days')}</Text>
              <Text variant="bodyStrong">{chosenDays.map((d) => t(`days.${d}`)).join(', ')}</Text></Row>
            <Row justify="space-between"><Text muted>{t('subscribe.firstDay')}</Text><Text variant="bodyStrong">{istDate(startDate, locale)}</Text></Row>
          </Card>
        ) : null}
      </Screen>
    );
  }

  const ready = !!plan && !!effectiveAddress && chosenDays.length > 0 && !tooManyDays && !!startDate;
  return (
    <Screen
      footer={
        <>
          {plan ? (
            <Row justify="space-between">
              <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
                {t('subscribe.footerSummary', { plan: plan.name, count: chosenDays.length, date: istDate(startDate, locale) })}
              </Text>
              <Row gap={1}>
                <Lock size={12} color={theme.colors.textFaint} />
                <Text variant="caption" tone="faint">Razorpay</Text>
              </Row>
            </Row>
          ) : null}
          <Button
            title={!plan ? t('subscribe.choosePlanFirst')
              : trialDays > 0 ? t('subscribe.startTrial') : t('subscribe.pay', { amount: rupees(payable) })}
            size="lg"
            onPress={pay}
            loading={busy}
            disabled={!ready}
            testID="subscribe-pay"
          />
        </>
      }
    >
      {childName ? (
        <Row gap={3}>
          <Avatar name={[child.data?.firstName, child.data?.lastName].filter(Boolean).join(' ')} size={48} />
          <View style={{ flex: 1 }}>
            <Text variant="overline" muted>{t('subscribe.for')}</Text>
            <Text variant="heading">{childName} · {child.data?.schoolName}</Text>
          </View>
        </Row>
      ) : null}
      {error ? <Banner tone="danger" title={t('common.problem')}>{error}</Banner> : null}
      {school.data ? <SchoolInfoCard school={school.data} compact /> : null}

      <SectionHeader title={t('subscribe.planStep')} />
      {activePlans.map((p) => {
        const on = planId === p.id;
        return (
          <Card key={p.id} tone="raised" selected={on} onPress={() => { haptic.tap(); setPlanId(p.id); }}
                accessibilityLabel={`${p.name}, ${rupees(p.pricePaise)}`}>
            <Row gap={3} align="flex-start">
              <Radio on={on} />
              <View style={{ flex: 1, gap: 4 }}>
                <Row justify="space-between" align="flex-start">
                  <Text variant="heading" style={{ flex: 1 }}>{p.name}</Text>
                  {bestValue === p.id ? <Badge label={t('subscribe.bestValue')} tone="accent" /> : null}
                </Row>
                <Row gap={1} align="flex-end">
                  <Text variant="numeral">{rupees(p.pricePaise)}</Text>
                  <Text variant="caption" muted style={{ paddingBottom: 4 }}>
                    / {t(p.billingPeriod === 'MONTHLY' ? 'subscribe.month' : 'subscribe.quarter')}
                  </Text>
                </Row>
                <Text variant="caption" muted>
                  {t('subscribe.perLunch', { price: rupees(perLunchPaise(p, chosenDays.length)) })} · {t('subscribe.maxDays', { count: p.maxDaysPerWeek })}
                </Text>
                {p.trialDays > 0 ? <Badge label={t('plans.trialDays', { count: p.trialDays })} tone="success" /> : null}
                {p.description ? <Text variant="caption" muted>{p.description}</Text> : null}
                {[...p.features, ...p.featureList.map((f) => featureText(f, t))].slice(0, 6).map((f) => (
                  <Row key={f} gap={1.5}>
                    <Check size={14} color={theme.colors.primary} />
                    <Text variant="caption" style={{ flex: 1 }}>{f}</Text>
                  </Row>
                ))}
              </View>
            </Row>
          </Card>
        );
      })}

      <SectionHeader title={t('subscribe.days')}
                     action={<Text variant="caption" muted>{t('subscribe.daysCount', { count: chosenDays.length })}</Text>} />
      {school.data ? (
        <Text variant="caption" muted>
          {t('subscribe.schoolDaysOnly', { school: school.data.name, days: schoolDays.map((d) => t(`days.${d}`)).join(', ') })}
        </Text>
      ) : null}
      <Row gap={2}>
        {schoolDays.map((d) => {
          const on = chosenDays.includes(d);
          const blocked = !offered.includes(d);
          return (
            <PressableScale key={d} style={{ flex: 1 }} scaleTo={0.92} accessibilityRole="checkbox" disabled={blocked}
                            accessibilityState={{ checked: on, disabled: blocked }} accessibilityLabel={t(`days.${d}`)}
                            onPress={() => {
                              haptic.tap();
                              setDays((cur) => {
                                const list = cur ?? [];
                                return list.includes(d) ? list.filter((x) => x !== d) : (sortDays([...list, d]) as Weekday[]);
                              });
                            }}>
              <View style={{ paddingVertical: 14, alignItems: 'center', borderRadius: theme.radius.md, borderWidth: on ? 0 : 1,
                borderColor: theme.colors.border, backgroundColor: on ? theme.colors.primary : theme.colors.surface,
                opacity: blocked ? 0.4 : 1 }}>
                <Text variant="label" style={{ color: on ? theme.colors.onPrimary : theme.colors.textMuted }}>{t(`days.${d}`)}</Text>
              </View>
            </PressableScale>
          );
        })}
      </Row>
      {allowed && schoolDays.some((d) => !allowed.has(d)) ? (
        <Text variant="caption" muted>
          {t('subscribe.notOnDays', { days: schoolDays.filter((d) => !allowed.has(d)).map((d) => t(`days.${d}`)).join(', ') })}
        </Text>
      ) : null}
      {tooManyDays ? <Banner tone="warning">{t('subscribe.tooManyDays', { count: plan!.maxDaysPerWeek })}</Banner> : null}

      <SectionHeader title={t('subscribe.address')} />
      {addresses.data?.map((a) => {
        const on = effectiveAddress === a.id;
        return (
          <Card key={a.id} selected={on} onPress={() => { haptic.tap(); setAddressId(a.id); }} accessibilityLabel={`${a.label}, ${a.line1}`}>
            <Row gap={3}>
              <Radio on={on} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{a.label}</Text>
                <Text variant="caption" muted numberOfLines={1}>{a.line1}{a.line2 ? `, ${a.line2}` : ''} · {a.pincode}</Text>
              </View>
              <Icon as={MapPin} size={18} color="textFaint" />
            </Row>
          </Card>
        );
      })}
      <Button title={t('address.add')} variant="outline" icon={Plus} onPress={() => router.push('/addresses/new')} />

      <SectionHeader title={t('subscribe.startDate')} />
      {school.data && startOptions.length === 0 ? <Banner tone="warning">{t('subscribe.noSchoolDay')}</Banner> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {startOptions.map((d) => {
          const on = startDate === d;
          const tile = dayTile(d);
          return (
            <PressableScale key={d} scaleTo={0.94} accessibilityRole="radio" accessibilityState={{ selected: on }}
                            accessibilityLabel={istDate(d, locale)} onPress={() => { haptic.tap(); setStartDate(d); }}>
              <View style={{ width: 64, paddingVertical: 12, alignItems: 'center', gap: 2, borderRadius: theme.radius.md,
                borderWidth: on ? 2 : 1, borderColor: on ? theme.colors.primary : theme.colors.border,
                backgroundColor: on ? theme.colors.primarySoft : theme.colors.surface }}>
                <Text variant="caption" muted>{tile.weekday}</Text>
                <Text variant="numeral" style={{ fontSize: 24, lineHeight: 30, color: on ? theme.colors.onPrimarySoft : theme.colors.text }}>
                  {tile.day}
                </Text>
                <Text variant="caption" muted>{tile.month}</Text>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>

      {plan && trialDays === 0 ? (
        <>
          <SectionHeader title={t('subscribe.coupon')} />
          {coupon ? (
            <Card tone="sunken">
              <Row gap={2}>
                <Icon as={Ticket} size={18} color="primary" />
                <Text style={{ flex: 1 }}>{t('subscribe.couponApplied', { code: coupon.couponCode, amount: rupees(coupon.discountPaise) })}</Text>
                <Button title={t('subscribe.removeCoupon')} variant="ghost" size="sm" inline
                        onPress={() => { setCoupon(null); setCouponInput(''); }} />
              </Row>
              <Row justify="space-between"><Text muted>{t('subscribe.total')}</Text>
                <Text variant="bodyStrong">{rupees(coupon.payablePaise)}</Text></Row>
            </Card>
          ) : (
            <Row gap={2} align="flex-start">
              <View style={{ flex: 1 }}>
                <TextField label={t('subscribe.coupon')} value={couponInput} autoCapitalize="characters" autoCorrect={false}
                           onChangeText={(v) => { setCouponInput(v); setCouponError(null); }} error={couponError ?? undefined}
                           maxLength={30} testID="coupon-input" />
              </View>
              <View style={{ paddingTop: 24 }}>
                <Button title={t('subscribe.applyCoupon')} variant="outline" onPress={() => void applyCoupon()}
                        loading={checkingCoupon} disabled={!couponInput.trim()} />
              </View>
            </Row>
          )}
        </>
      ) : null}
      {plan && trialDays > 0 ? <Banner tone="success">{t('subscribe.trial', { count: trialDays })}</Banner> : null}
    </Screen>
  );
}
