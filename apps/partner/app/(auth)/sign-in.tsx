import { Banner } from '@lunchbox/ui';
import { useTranslation } from 'react-i18next';
import { PhoneSignIn } from '../../src/components/PhoneSignIn';
import { useSession } from '../../src/lib/session';

export default function SignIn() {
  const { t } = useTranslation();
  const message = useSession((s) => s.message);
  return (
    <PhoneSignIn
      tagline={t('auth.tagline')}
      eyebrow={t('auth.partner')}
      notice={message ? <Banner tone="warning">{message}</Banner> : null}
    />
  );
}
