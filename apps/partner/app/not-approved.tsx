import { Banner, Button, Screen, Text } from '@lunchbox/ui';
import { useTranslation } from 'react-i18next';
import { signOut } from '../src/lib/firebase';
import { useSession } from '../src/lib/session';

export default function NotApproved() {
  const { t } = useTranslation();
  const message = useSession((s) => s.message);
  const refresh = useSession((s) => s.refresh);
  return (
    <Screen>
      <Text variant="title">{t('notApproved.title')}</Text>
      {message ? <Banner tone="warning">{message}</Banner> : null}
      <Button title={t('notApproved.retry')} onPress={() => void refresh()} />
      <Button title={t('notApproved.signOut')} variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
