import { istDate, rupees } from '@lunchbox/api-client';
import { Banner, Button, Card, Row, Screen, Text } from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Share, Switch } from 'react-native';
import { api } from '../../src/lib/api';
import { config } from '../../src/lib/config';
import { signOut } from '../../src/lib/firebase';
import { unregisterPush } from '../../src/lib/push';
import { errorMessage } from '../../src/lib/queryClient';
import { useSession } from '../../src/lib/session';

export default function AccountScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const [error, setError] = useState<string | null>(null);
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: api.subscriptions.list });

  const tracking = me?.consents.find((c) => c.purpose === 'LIVE_TRACKING');
  const trackingOn = !!tracking && tracking.granted && !tracking.withdrawnAt;

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
    onError: (e) => setError(errorMessage(e)),
  });

  async function exportData() {
    try {
      const data = await api.account.exportData();
      await Share.share({ title: 'LunchBox data export', message: JSON.stringify(data, null, 2) });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function doSignOut() {
    await unregisterPush();
    qc.clear();
    await signOut();
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

  return (
    <Screen>
      <Text variant="title">{t('account.title')}</Text>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Card>
        <Text variant="heading">{me?.displayName}</Text>
        <Text muted>{me?.phone}</Text>
      </Card>

      <Card>
        <Text variant="label">{t('account.language')}</Text>
        <Row>
          {(['en', 'hi'] as const).map((lang) => (
            <Pressable key={lang} accessibilityRole="radio" accessibilityState={{ selected: i18n.language === lang }}
                       onPress={() => setLanguage.mutate(lang)} style={{ padding: 8 }}>
              <Text variant="label" muted={i18n.language !== lang}>{lang === 'en' ? 'English' : 'हिन्दी'}</Text>
            </Pressable>
          ))}
        </Row>
      </Card>

      <Card>
        <Text variant="label">{t('account.plans')}</Text>
        {subs.data?.map((s) => (
          <Row key={s.id} style={{ justifyContent: 'space-between' }}>
            <Text style={{ flex: 1 }}>
              {s.childName} · {s.planName} · {rupees(s.pricePaise)} · {s.status}
              {s.currentPeriodEnd ? ` · ${istDate(s.currentPeriodEnd)}` : ''}
            </Text>
            {s.status === 'ACTIVE' || s.status === 'HALTED' ? (
              <Button title={t('account.cancelPlan')} variant="ghost" onPress={() => cancelPlan.mutate(s.id)} />
            ) : null}
          </Row>
        ))}
      </Card>

      <Button title={t('account.addresses')} variant="secondary" onPress={() => router.push('/addresses')} />
      <Button title={t('account.orders')} variant="secondary" onPress={() => router.push('/orders/history')} />
      <Button title={t('account.payments')} variant="secondary" onPress={() => router.push('/payments')} />

      <Card>
        <Text variant="label">{t('account.privacy')}</Text>
        <Row>
          <Switch value={trackingOn} onValueChange={(v) => setTracking.mutate(v)} accessibilityLabel={t('consent.liveTracking')} />
          <Text style={{ flex: 1 }}>{t('consent.liveTracking')}</Text>
        </Row>
        <Button title={t('account.export')} variant="ghost" onPress={exportData} />
        <Button title={t('account.delete')} variant="danger" onPress={deleteAccount} />
      </Card>

      <Button title={t('account.signOut')} variant="ghost" onPress={doSignOut} testID="sign-out" />
    </Screen>
  );
}
