import type { IssueType } from '@lunchbox/api-client';
import { Banner, Button, Card, Icon, ListGroup, PressableScale, Row, Screen, SectionHeader, Text, TextField, haptic, useTheme, type LucideIcon } from '@lunchbox/ui';
import { useRouter } from 'expo-router';
import { Car, CircleCheck, CircleHelp, LocateFixed, PhoneCall, PhoneOff, School, Siren, Wrench } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';
import { currentPosition } from '../src/lib/locationTask';
import { runOrQueue } from '../src/lib/offlineQueue';
import { errorMessage } from '../src/lib/queryClient';

const OTHER_TYPES: { type: IssueType; icon: LucideIcon }[] = [
  { type: 'ACCIDENT', icon: Car },
  { type: 'VEHICLE_BREAKDOWN', icon: Wrench },
  { type: 'PARENT_UNREACHABLE', icon: PhoneOff },
  { type: 'SCHOOL_CLOSED', icon: School },
  { type: 'OTHER', icon: CircleHelp },
];

export default function IssueScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [type, setType] = useState<IssueType>('SOS');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ queued: boolean } | null>(null);
  const sos = type === 'SOS';

  async function send() {
    setBusy(true);
    setError(null);
    try {
      let location: { lat: number; lng: number } | undefined;
      try {
        location = await currentPosition();
      } catch {
        location = undefined;
      }
      const r = await runOrQueue({ kind: 'issue', body: { type, description: description.trim() || undefined, location } });
      haptic.success();
      setSent(r);
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen footer={<Button title={t('common.back')} size="lg" onPress={() => router.back()} />}>
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 40 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <CircleCheck size={44} color={theme.colors.primary} />
          </View>
          <Text variant="title" center>{sent.queued ? t('issue.queuedTitle') : t('issue.sent')}</Text>
          <Text muted center style={{ maxWidth: 300 }}>{sent.queued ? t('stop.queued') : t('issue.sentHint')}</Text>
        </View>
        {sos ? (
          <Card tone="danger" gap={3}>
            <Text variant="bodyStrong" style={{ color: theme.colors.onDangerSoft }}>{t('issue.emergencyTitle')}</Text>
            <Button title={t('issue.call112')} variant="danger" icon={PhoneCall} size="lg" onPress={() => void Linking.openURL('tel:112')} />
          </Card>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen
      keyboard
      footer={
        <Button title={sos ? t('issue.sos') : t('issue.send')} variant={sos ? 'danger' : 'primary'} size="lg" icon={sos ? Siren : undefined}
                loading={busy} onPress={send} testID="send-issue" />
      }
    >
      {error ? <Banner tone="danger" title={t('common.problem')}>{error}</Banner> : null}

      <PressableScale onPress={() => { haptic.tap(); setType('SOS'); }} accessibilityRole="radio" accessibilityState={{ selected: sos }}
                      accessibilityLabel={t('issueTypes.SOS')}>
        <View style={{ borderRadius: theme.radius.xl, padding: 20, gap: 10, backgroundColor: sos ? theme.colors.danger : theme.colors.dangerSoft,
          borderWidth: 2, borderColor: theme.colors.danger }}>
          <Row gap={3}>
            <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
              backgroundColor: sos ? 'rgba(255,255,255,0.18)' : theme.colors.surface }}>
              <Siren size={28} color={sos ? theme.colors.onDanger : theme.colors.danger} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading" style={{ color: sos ? theme.colors.onDanger : theme.colors.onDangerSoft }}>{t('issueTypes.SOS')}</Text>
              <Text variant="caption" style={{ color: sos ? theme.colors.onDanger : theme.colors.onDangerSoft, opacity: 0.9 }}>
                {t('issue.sosHint')}
              </Text>
            </View>
          </Row>
        </View>
      </PressableScale>

      <SectionHeader title={t('issue.type')} />
      <ListGroup>
        {OTHER_TYPES.map(({ type: it, icon }) => {
          const on = type === it;
          return (
            <PressableScale key={it} onPress={() => { haptic.tap(); setType(it); }} scaleTo={0.99} accessibilityRole="radio"
                            accessibilityState={{ selected: on }} accessibilityLabel={t(`issueTypes.${it}`)}>
              <Row gap={3} style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: on ? theme.colors.primarySoft : 'transparent' }}>
                <Icon as={icon} size={20} color={on ? 'onPrimarySoft' : 'textMuted'} />
                <Text variant="subheading" style={{ flex: 1, color: on ? theme.colors.onPrimarySoft : theme.colors.text }}>
                  {t(`issueTypes.${it}`)}
                </Text>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 7 : 1.5,
                  borderColor: on ? theme.colors.primary : theme.colors.borderStrong }} />
              </Row>
            </PressableScale>
          );
        })}
      </ListGroup>

      <TextField label={t('issue.description')} value={description} onChangeText={setDescription} multiline maxLength={1000} counter />
      <Row gap={2} align="flex-start">
        <Icon as={LocateFixed} size={14} color="textFaint" />
        <Text variant="caption" tone="faint" style={{ flex: 1 }}>{t('issue.locationNote')}</Text>
      </Row>
    </Screen>
  );
}
