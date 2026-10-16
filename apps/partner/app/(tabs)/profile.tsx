import { Banner, Button, Card, Loading, Screen, Text } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../src/lib/api';
import { signOut } from '../../src/lib/firebase';
import { stopRouteTracking } from '../../src/lib/locationTask';
import { useActionQueue } from '../../src/lib/offlineQueue';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const me = useQuery({ queryKey: ['partner', 'me'], queryFn: api.partner.me });
  const items = useActionQueue((s) => s.items);
  const failed = useActionQueue((s) => s.failed);
  const flush = useActionQueue((s) => s.flush);
  const dismiss = useActionQueue((s) => s.dismissFailed);

  if (me.isLoading) return <Loading />;
  return (
    <Screen>
      <Text variant="title">{me.data?.firstName} {me.data?.lastName ?? ''}</Text>
      <Card>
        <Text>{t('profile.vehicle')}: {me.data?.vehicleType} · {me.data?.vehicleNumber ?? ''}</Text>
        <Text>{t('profile.capacity')}: {me.data?.capacity}</Text>
        <Text>{t('profile.rating')}: {me.data?.rating ?? '—'}</Text>
      </Card>
      {items.length > 0 ? (
        <Card>
          <Text>{t('profile.pendingSync', { count: items.length })}</Text>
          {items.map((i) => (
            <Text key={i.id} variant="caption" muted>{i.action.kind} · {i.attempts} · {i.lastError ?? ''}</Text>
          ))}
          <Button title={t('profile.syncNow')} variant="secondary" onPress={() => void flush()} />
        </Card>
      ) : null}
      {failed.map((f) => (
        <Banner key={f.id} tone="danger">
          {f.action.kind}: {f.lastError}
        </Banner>
      ))}
      {failed.length > 0 ? (
        <Button title="OK" variant="ghost" onPress={() => failed.forEach((f) => dismiss(f.id))} />
      ) : null}
      <Button
        title={t('profile.signOut')}
        variant="ghost"
        onPress={async () => {
          await stopRouteTracking();
          await signOut();
        }}
      />
    </Screen>
  );
}
