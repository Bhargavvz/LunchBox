import { Banner, Button, Card, Row, Screen, Text } from '@lunchbox/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from 'react-native';
import { api } from '../../src/lib/api';
import { config } from '../../src/lib/config';
import { errorMessage } from '../../src/lib/queryClient';
import { useSession } from '../../src/lib/session';

/** DPDP Act 2023 s.9: verifiable parental consent before any child data is collected. */
export default function ConsentScreen() {
  const { t } = useTranslation();
  const refresh = useSession((s) => s.refresh);
  const [childData, setChildData] = useState(false);
  const [tracking, setTracking] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!childData) {
      setError(t('consent.required'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const v = config.policyVersion;
      await api.account.recordConsent({ purpose: 'CHILD_DATA_PROCESSING', granted: true, policyVersion: v });
      await api.account.recordConsent({ purpose: 'LIVE_TRACKING', granted: tracking, policyVersion: v });
      await api.account.recordConsent({ purpose: 'MARKETING', granted: marketing, policyVersion: v });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const item = (label: string, value: boolean, onChange: (v: boolean) => void, testID: string) => (
    <Card>
      <Row>
        <Switch value={value} onValueChange={onChange} accessibilityLabel={label} testID={testID} />
        <Text style={{ flex: 1 }}>{label}</Text>
      </Row>
    </Card>
  );

  return (
    <Screen>
      <Text variant="title">{t('consent.title')}</Text>
      <Text muted>{t('consent.intro')}</Text>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {item(t('consent.childData'), childData, setChildData, 'consent-child')}
      {item(t('consent.liveTracking'), tracking, setTracking, 'consent-tracking')}
      {item(t('consent.marketing'), marketing, setMarketing, 'consent-marketing')}
      <Button title={t('consent.give')} onPress={submit} loading={busy} testID="consent-submit" />
    </Screen>
  );
}
