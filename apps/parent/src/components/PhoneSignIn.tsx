import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { Banner, Button, Screen, Text, TextField } from '@lunchbox/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { startPhoneSignIn } from '../lib/firebase';

/**
 * Phone OTP sign-in via Firebase Auth. Shared shape with the partner app; Firebase applies its own abuse
 * protection (Play Integrity / reCAPTCHA) and rate limits to SMS sends.
 */
export function PhoneSignIn({ title, subtitle }: { title: string; subtitle: string }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<FirebaseAuthTypes.ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = phone.replace(/\D/g, '').slice(-10);
  const validPhone = /^[6-9]\d{9}$/.test(digits);

  async function send() {
    if (!validPhone) {
      setError(t('auth.invalidPhone'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setConfirmation(await startPhoneSignIn(`+91${digits}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!confirmation) return;
    setBusy(true);
    setError(null);
    try {
      await confirmation.confirm(code.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text variant="title">{title}</Text>
      <Text muted>{subtitle}</Text>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {!confirmation ? (
        <>
          <TextField
            label={t('auth.phone')}
            hint={t('auth.phoneHint')}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            value={phone}
            onChangeText={setPhone}
            maxLength={14}
            testID="phone-input"
          />
          <Button title={t('auth.sendCode')} onPress={send} loading={busy} testID="send-code" />
        </>
      ) : (
        <>
          <TextField
            label={t('auth.code')}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            value={code}
            onChangeText={setCode}
            maxLength={6}
            testID="otp-input"
          />
          <Button title={t('auth.verify')} onPress={verify} loading={busy} disabled={code.length !== 6} testID="verify-code" />
          <Button title={t('auth.resend')} variant="ghost" onPress={send} disabled={busy} />
        </>
      )}
    </Screen>
  );
}
