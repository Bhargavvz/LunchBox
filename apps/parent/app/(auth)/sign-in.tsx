import { Banner } from '@lunchbox/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PhoneSignIn } from '../../src/components/PhoneSignIn';
import { useSession } from '../../src/lib/session';

export default function SignInScreen() {
  const { t } = useTranslation();
  const error = useSession((s) => s.error);
  return (
    <View style={{ flex: 1 }}>
      {error ? <Banner tone="warning">{error}</Banner> : null}
      <PhoneSignIn title="LunchBox" subtitle={t('auth.welcome')} />
    </View>
  );
}
