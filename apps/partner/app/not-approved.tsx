import { Banner, Button, Screen, Text, TiffinArt } from '@lunchbox/ui';
import { RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { signOut } from '../src/lib/firebase';
import { useSession } from '../src/lib/session';

export default function NotApproved() {
  const { t } = useTranslation();
  const message = useSession((s) => s.message);
  const refresh = useSession((s) => s.refresh);
  const [checking, setChecking] = useState(false);
  return (
    <Screen
      safeTop
      footer={
        <>
          <Button title={t('notApproved.retry')} icon={RefreshCw} size="lg" loading={checking} onPress={async () => {
            setChecking(true);
            try {
              await refresh();
            } finally {
              setChecking(false);
            }
          }} />
          <Button title={t('notApproved.signOut')} variant="ghost" onPress={() => void signOut()} />
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: 14, paddingTop: 56 }}>
        <TiffinArt size={110} mood="muted" />
        <Text variant="title" center>{t('notApproved.title')}</Text>
        <Text muted center style={{ maxWidth: 320 }}>{t('notApproved.hint')}</Text>
      </View>
      {message ? <Banner tone="warning">{message}</Banner> : null}
    </Screen>
  );
}
