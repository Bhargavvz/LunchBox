import { useTranslation } from 'react-i18next';
import { PhoneSignIn } from '../../src/components/PhoneSignIn';

export default function SignIn() {
  const { t } = useTranslation();
  return <PhoneSignIn title="LunchBox Partner" subtitle={t('auth.welcome')} />;
}
