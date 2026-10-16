import type { IssueType } from '@lunchbox/api-client';
import { Banner, Button, Card, Screen, Text, TextField, useTheme } from '@lunchbox/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { currentPosition } from '../src/lib/locationTask';
import { runOrQueue } from '../src/lib/offlineQueue';
import { errorMessage } from '../src/lib/queryClient';

const TYPES: IssueType[] = ['SOS', 'ACCIDENT', 'VEHICLE_BREAKDOWN', 'PARENT_UNREACHABLE', 'SCHOOL_CLOSED', 'OTHER'];

export default function IssueScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [type, setType] = useState<IssueType>('SOS');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

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
      await runOrQueue({ kind: 'issue', body: { type, description: description.trim() || undefined, location } });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen>
        <Banner tone="success">{t('issue.sent')}</Banner>
        <Button title={t('common.back')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="title">{t('issue.title')}</Text>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Text variant="label">{t('issue.type')}</Text>
      {TYPES.map((it) => (
        <Pressable key={it} accessibilityRole="radio" accessibilityState={{ selected: type === it }} onPress={() => setType(it)}>
          <Card style={type === it ? { borderColor: theme.colors.primary, borderWidth: 2 } : undefined}>
            <Text variant="label" style={it === 'SOS' ? { color: theme.colors.danger } : undefined}>{t(`issueTypes.${it}`)}</Text>
          </Card>
        </Pressable>
      ))}
      <TextField label={t('issue.description')} value={description} onChangeText={setDescription} multiline maxLength={1000} />
      <Button title={type === 'SOS' ? t('issue.sos') : t('issue.send')} variant={type === 'SOS' ? 'danger' : 'primary'}
              loading={busy} onPress={send} testID="send-issue" />
    </Screen>
  );
}
