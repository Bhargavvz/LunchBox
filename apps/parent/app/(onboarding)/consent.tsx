import { Badge, Banner, Button, Icon, ListGroup, PageTitle, Row, Screen, Text, ToggleRow, useTheme } from '@lunchbox/ui';
import { ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StepHeader } from '../../src/components/StepHeader';
import { api } from '../../src/lib/api';
import { config } from '../../src/lib/config';
import { errorMessage } from '../../src/lib/queryClient';
import { useSession } from '../../src/lib/session';

/** DPDP Act 2023 s.9: verifiable parental consent before any child data is collected. */
export default function ConsentScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
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

  return (
    <Screen safeTop footer={<Button title={t('consent.give')} size="lg" onPress={submit} loading={busy} testID="consent-submit" />}>
      <StepHeader step={2} of={2} />
      <PageTitle title={t('consent.title')} />
      <Row gap={3} align="flex-start" style={{ backgroundColor: theme.colors.infoSoft, borderRadius: theme.radius.lg, padding: 16 }}>
        <Icon as={ShieldCheck} size={22} color="onInfoSoft" />
        <Text variant="body" style={{ flex: 1, color: theme.colors.onInfoSoft }}>{t('consent.intro')}</Text>
      </Row>
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <View style={{ gap: 8 }}>
        <Row justify="space-between">
          <Text variant="overline" muted>{t('consent.requiredLabel')}</Text>
          <Badge label={t('consent.requiredBadge')} tone="accent" />
        </Row>
        <ListGroup>
          <ToggleRow title={t('consent.childDataTitle')} description={t('consent.childData')} value={childData}
                     onChange={(v) => { setChildData(v); if (v) setError(null); }} testID="consent-child" />
        </ListGroup>
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="overline" muted>{t('consent.optionalLabel')}</Text>
        <ListGroup>
          <ToggleRow title={t('consent.trackingTitle')} description={t('consent.liveTracking')} value={tracking}
                     onChange={setTracking} testID="consent-tracking" />
          <ToggleRow title={t('consent.marketingTitle')} description={t('consent.marketing')} value={marketing}
                     onChange={setMarketing} testID="consent-marketing" />
        </ListGroup>
      </View>
      <Text variant="caption" tone="faint">{t('consent.changeLater')}</Text>
    </Screen>
  );
}
