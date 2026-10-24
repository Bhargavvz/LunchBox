import { istDate, rupees } from '@lunchbox/api-client';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  ListGroup,
  ListItem,
  PageTitle,
  Screen,
  SectionHeader,
  SegmentedControl,
  Text,
  ToggleRow,
  Wordmark,
  useToast,
} from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Download, History, LogOut, MapPin, ReceiptText, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Share, View } from 'react-native';
import { api } from '../../src/lib/api';
import { config } from '../../src/lib/config';
import { signOut } from '../../src/lib/firebase';
import { unregisterPush } from '../../src/lib/push';
import { errorMessage } from '../../src/lib/queryClient';
import { useSession } from '../../src/lib/session';

const STATUS_TONE = { ACTIVE: 'primary', PENDING_PAYMENT: 'accent', PAUSED: 'neutral', HALTED: 'danger', CANCELLED: 'neutral',
  EXPIRED: 'neutral' } as const;

/** +919876543210 → +91 98765 43210 */
function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

export default function AccountScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const [error, setError] = useState<string | null>(null);
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: api.subscriptions.list });

  const tracking = me?.consents.find((c) => c.purpose === 'LIVE_TRACKING');
  const trackingOn = !!tracking && tracking.granted && !tracking.withdrawnAt;
  const name = [me?.parent?.firstName, me?.parent?.lastName].filter(Boolean).join(' ') || me?.displayName || '';

  const setLanguage = useMutation({
    mutationFn: async (lang: 'en' | 'hi') => {
      await api.account.update({ preferredLanguage: lang });
      await i18n.changeLanguage(lang);
      await refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const setTracking = useMutation({
    mutationFn: async (granted: boolean) => {
      await api.account.recordConsent({ purpose: 'LIVE_TRACKING', granted, policyVersion: config.policyVersion });
      await refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const cancelPlan = useMutation({
    mutationFn: (id: string) => api.subscriptions.cancel(id, 'Cancelled by parent in app'),
    onSuccess: () => {
      toast(t('account.planCancelled'));
      return qc.invalidateQueries({ queryKey: ['subscriptions'] });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  async function exportData() {
    try {
      const data = await api.account.exportData();
      await Share.share({ title: 'LunchBox data export', message: JSON.stringify(data, null, 2) });
      toast(t('account.exportDone'));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function doSignOut() {
    await unregisterPush();
    qc.clear();
    await signOut();
  }

  function confirmCancel(id: string, label: string) {
    Alert.alert(t('account.cancelPlan'), t('account.cancelConfirm', { plan: label }), [
      { text: t('common.keep'), style: 'cancel' },
      { text: t('account.cancelPlan'), style: 'destructive', onPress: () => cancelPlan.mutate(id) },
    ]);
  }

  function deleteAccount() {
    Alert.alert(t('account.delete'), t('account.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.account.deleteAccount();
            await doSignOut();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);
  }

  const plans = (subs.data ?? []).filter((s) => s.status !== 'CANCELLED' && s.status !== 'EXPIRED');

  return (
    <Screen safeTop gap={5}>
      <PageTitle title={t('account.title')} />
      {error ? <Banner tone="danger" title={t('common.problem')}>{error}</Banner> : null}

      <Card tone="brand">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={name || 'LunchBox'} size={60} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" tone="onPrimary" numberOfLines={1}>{name}</Text>
            <Text variant="caption" tone="onPrimary" style={{ opacity: 0.8, fontVariant: ['tabular-nums'] }}>{formatPhone(me?.phone)}</Text>
          </View>
        </View>
      </Card>

      {plans.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title={t('account.plans')} />
          <ListGroup>
            {plans.map((s) => (
              <ListItem
                key={s.id}
                title={`${s.childName} · ${s.planName}`}
                subtitle={[rupees(s.pricePaise), s.currentPeriodEnd ? t('account.renews', { date: istDate(s.currentPeriodEnd) }) : null]
                  .filter(Boolean).join(' · ')}
                trailing={
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Badge label={t(`account.subStatus.${s.status}`)} tone={STATUS_TONE[s.status]} />
                    {s.status === 'ACTIVE' || s.status === 'HALTED' ? (
                      <Button title={t('account.cancelPlan')} variant="ghost" size="sm" inline
                              loading={cancelPlan.isPending && cancelPlan.variables === s.id}
                              onPress={() => confirmCancel(s.id, `${s.childName} · ${s.planName}`)} />
                    ) : null}
                  </View>
                }
              />
            ))}
          </ListGroup>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionHeader title={t('account.manage')} />
        <ListGroup>
          <ListItem icon={MapPin} title={t('account.addresses')} subtitle={t('account.addressesHint')} onPress={() => router.push('/addresses')} />
          <ListItem icon={History} iconTone="info" title={t('account.orders')} onPress={() => router.push('/orders/history')} />
          <ListItem icon={ReceiptText} iconTone="accent" title={t('account.payments')} onPress={() => router.push('/payments')} />
        </ListGroup>
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeader title={t('account.preferences')} />
        <Card gap={3}>
          <Text variant="label">{t('account.language')}</Text>
          <SegmentedControl
            options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]}
            value={i18n.language === 'hi' ? 'hi' : 'en'}
            onChange={(v) => setLanguage.mutate(v as 'en' | 'hi')}
          />
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeader title={t('account.privacy')} />
        <ListGroup>
          <ToggleRow title={t('account.liveLocation')} description={t('consent.liveTracking')} value={trackingOn}
                     disabled={setTracking.isPending} onChange={(v) => setTracking.mutate(v)} />
          <ListItem icon={Download} iconTone="neutral" title={t('account.export')} subtitle={t('account.exportHint')} onPress={exportData} />
          <ListItem icon={Trash2} destructive title={t('account.delete')} onPress={deleteAccount} />
        </ListGroup>
      </View>

      <Button title={t('account.signOut')} variant="outline" icon={LogOut} onPress={doSignOut} testID="sign-out" />

      <View style={{ alignItems: 'center', gap: 6, paddingTop: 8 }}>
        <Wordmark size={18} />
        <Text variant="caption" tone="faint">
          {t('account.version', { version: Constants.expoConfig?.version ?? '' })}
        </Text>
      </View>
    </Screen>
  );
}
