import { Banner } from '@lunchbox/ui';
import { useTranslation } from 'react-i18next';
import { PhoneSignIn } from '../../src/components/PhoneSignIn';
import { useSession } from '../../src/lib/session';

export default function SignInScreen() {
  const { t } = useTranslation();
  const error = useSession((s) => s.error);
  return <PhoneSignIn tagline={t('auth.tagline')} notice={error ? <Banner tone="warning">{error}</Banner> : null} />;
}
