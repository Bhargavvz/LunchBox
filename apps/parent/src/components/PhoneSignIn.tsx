import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { Banner, Button, OtpInput, Row, Screen, Text, TextField, TiffinArt, Wordmark, useTheme } from '@lunchbox/ui';
import { ArrowRight, Pencil } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { startPhoneSignIn } from '../lib/firebase';

const RESEND_AFTER_S = 30;

/** Maps Firebase Auth error codes to sentences a parent can act on; anything unexpected keeps Firebase's text. */
function authError(e: unknown, t: (k: string) => string): string {
  const code = (e as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/invalid-verification-code':
      return t('auth.errors.wrongCode');
    case 'auth/code-expired':
    case 'auth/session-expired':
      return t('auth.errors.expired');
    case 'auth/too-many-requests':
      return t('auth.errors.tooMany');
    case 'auth/network-request-failed':
      return t('auth.errors.network');
    case 'auth/invalid-phone-number':
      return t('auth.invalidPhone');
    default:
      return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Phone OTP sign-in via Firebase Auth. Shared shape with the partner app; Firebase applies its own abuse
 * protection (Play Integrity / reCAPTCHA) and rate limits to SMS sends.
 */
export function PhoneSignIn({ tagline, notice, eyebrow }: { tagline: string; notice?: ReactNode; eyebrow?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<FirebaseAuthTypes.ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const verifying = useRef(false);

  const digits = phone.replace(/\D/g, '').slice(-10);
  const validPhone = /^[6-9]\d{9}$/.test(digits);
  const pretty = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function send() {
    if (!validPhone) {
      setError(t('auth.invalidPhone'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setConfirmation(await startPhoneSignIn(`+91${digits}`));
      setCode('');
      setResendIn(RESEND_AFTER_S);
    } catch (e) {
      setError(authError(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function verify(value = code) {
    if (!confirmation || verifying.current || value.length !== 6) return;
    verifying.current = true;
    setBusy(true);
    setError(null);
    try {
      await confirmation.confirm(value.trim());
    } catch (e) {
      setError(authError(e, t));
      setCode('');
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen padded={false} keyboard gap={0}>
      <View style={{ backgroundColor: theme.colors.primary, paddingTop: insets.top + 28, paddingBottom: 36, paddingHorizontal: 24,
        borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden', gap: 18 }}>
        {/* Two soft discs give the panel depth without a stock gradient. */}
        <View style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, right: -90, top: -60,
          backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, left: -70, bottom: -80,
          backgroundColor: 'rgba(0,0,0,0.07)' }} />
        <Row gap={2.5}>
          <Wordmark size={24} tone="onPrimary" />
          {eyebrow ? (
            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text variant="overline" tone="onPrimary">{eyebrow}</Text>
            </View>
          ) : null}
        </Row>
        <Row justify="space-between" align="flex-end" gap={4}>
          <Text variant="title" tone="onPrimary" style={{ flex: 1 }}>{tagline}</Text>
          <TiffinArt size={78} mood="onPrimary" steam />
        </Row>
      </View>

      <View style={{ paddingHorizontal: 24, paddingTop: 28, gap: 18 }}>
        {notice}
        {!confirmation ? (
          <>
            <View style={{ gap: 4 }}>
              <Text variant="heading">{t('auth.phoneTitle')}</Text>
              <Text muted>{t('auth.phoneHint')}</Text>
            </View>
            <TextField
              label={t('auth.phone')}
              prefix="+91"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                if (error) setError(null);
              }}
              onSubmitEditing={send}
              returnKeyType="next"
              maxLength={14}
              error={error ?? undefined}
              testID="phone-input"
            />
            <Button title={t('auth.sendCode')} trailingIcon={ArrowRight} size="lg" onPress={send} loading={busy}
                    disabled={!validPhone} testID="send-code" />
          </>
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <Text variant="heading">{t('auth.codeTitle')}</Text>
              <Row gap={2} wrap>
                <Text muted>{t('auth.codeSentTo')}</Text>
                <Pressable onPress={() => { setConfirmation(null); setCode(''); setError(null); }} accessibilityRole="button"
                           accessibilityLabel={t('auth.changeNumber')} hitSlop={8}>
                  <Row gap={1}>
                    <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{pretty}</Text>
                    <Pencil size={14} color={theme.colors.primary} />
                  </Row>
                </Pressable>
              </Row>
            </View>
            <OtpInput
              label={t('auth.code')}
              value={code}
              onChange={(v) => {
                setCode(v);
                if (error) setError(null);
                if (v.length === 6) void verify(v);
              }}
              error={!!error}
              autoFocus
              testID="otp-input"
            />
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <Button title={t('auth.verify')} size="lg" onPress={() => void verify()} loading={busy}
                    disabled={code.length !== 6} testID="verify-code" />
            <Button
              title={resendIn > 0 ? t('auth.resendIn', { seconds: resendIn }) : t('auth.resend')}
              variant="ghost"
              onPress={send}
              disabled={busy || resendIn > 0}
            />
          </>
        )}
        <Text variant="caption" tone="faint" center style={{ paddingBottom: 24 }}>{t('auth.legal')}</Text>
      </View>
    </Screen>
  );
}
