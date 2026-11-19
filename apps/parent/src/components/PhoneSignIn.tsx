import {
  Banner, Button, Icon, OtpInput, Row, Screen, Text, TextField, TiffinArt, Wordmark, formatCountdown, useOtpSignIn, useTheme, useToast,
  type OtpProblem,
} from '@lunchbox/ui';
import { ArrowRight, House, Pencil, School, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { startPhoneSignIn } from '../lib/firebase';

/** Turns a sign-in problem into a sentence the user can act on. Unknown provider errors get a plain retry message. */
export function authError(problem: OtpProblem, t: (k: string, o?: Record<string, unknown>) => string): string {
  switch (problem.kind) {
    case 'cooldown':
      return t('auth.errors.cooldown', { seconds: problem.seconds });
    case 'limit':
      return t('auth.errors.limit', { minutes: Math.max(1, Math.ceil(problem.seconds / 60)) });
    case 'expired':
      return t('auth.errors.expired');
    case 'attempts':
      return t('auth.errors.attempts');
    case 'provider':
      switch (problem.code) {
        case 'auth/invalid-verification-code':
          return t('auth.errors.wrongCode');
        case 'auth/code-expired':
        case 'auth/session-expired':
          return t('auth.errors.expired');
        case 'auth/too-many-requests':
          return t('auth.errors.tooMany');
        case 'auth/quota-exceeded':
          return t('auth.errors.quota');
        case 'auth/network-request-failed':
          return t('auth.errors.network');
        case 'auth/invalid-phone-number':
          return t('auth.invalidPhone');
        case 'auth/credential-already-in-use':
          return t('profile.phoneInUse');
        case 'auth/app-not-authorized':
        case 'auth/captcha-check-failed':
        case 'auth/missing-client-identifier':
        case 'auth/web-context-cancelled':
          return t('auth.errors.device');
        default:
          return t('auth.errors.generic');
      }
  }
}

/** The three handoffs a parent is trusting us with: a real sequence, so it is drawn as one connected rail. */
function JourneySteps() {
  const { t } = useTranslation();
  const theme = useTheme();
  const steps: [LucideIcon, string][] = [
    [House, t('auth.steps.pack')],
    [ShieldCheck, t('auth.steps.pickup')],
    [School, t('auth.steps.school')],
  ];
  return (
    <View style={{ gap: 12, paddingTop: 8 }} accessibilityRole="list" accessibilityLabel={t('auth.steps.title')}>
      <Text variant="label" muted accessibilityRole="header">{t('auth.steps.title')}</Text>
      {steps.map(([glyph, label], i) => (
        <Row key={label} gap={3} align="stretch">
          <View style={{ alignItems: 'center', width: 36 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
              backgroundColor: i === 1 ? theme.colors.accentSoft : theme.colors.primarySoft }}>
              <Icon as={glyph} size={18} color={i === 1 ? 'onAccentSoft' : 'onPrimarySoft'} strokeWidth={2} />
            </View>
            {i < steps.length - 1 ? (
              <View style={{ flex: 1, width: 2, minHeight: 10, marginVertical: 3, backgroundColor: theme.colors.border }} />
            ) : null}
          </View>
          <Text style={{ flex: 1, paddingTop: 6, paddingBottom: i < steps.length - 1 ? 8 : 0 }}>{label}</Text>
        </Row>
      ))}
    </View>
  );
}

/**
 * Phone OTP sign-in via Firebase Auth. Shared shape with the partner app; Firebase applies its own abuse
 * protection (Play Integrity / reCAPTCHA) and rate limits to SMS sends.
 */
export function PhoneSignIn({ tagline, notice, eyebrow }: { tagline: string; notice?: ReactNode; eyebrow?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const otp = useOtpSignIn(startPhoneSignIn);

  const digits = phone.replace(/\D/g, '').slice(-10);
  const validPhone = /^[6-9]\d{9}$/.test(digits);
  const pretty = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  const error = invalid ? t('auth.invalidPhone') : otp.problem ? authError(otp.problem, t) : null;

  async function send() {
    if (!validPhone) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (await otp.send(`+91${digits}`)) setCode('');
  }

  async function resend() {
    if (await otp.resend()) {
      setCode('');
      toast(t('auth.resent', { phone: pretty }));
    }
  }

  async function verify(value = code) {
    if (!(await otp.verify(value))) setCode('');
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
        {!otp.codeSent ? (
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
                setInvalid(false);
                if (otp.problem) otp.clearProblem();
              }}
              onSubmitEditing={send}
              returnKeyType="next"
              maxLength={14}
              error={error ?? undefined}
              testID="phone-input"
            />
            <Button title={t('auth.sendCode')} trailingIcon={ArrowRight} size="lg" onPress={send} loading={otp.busy}
                    disabled={!validPhone} testID="send-code" />
            <JourneySteps />
          </>
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <Text variant="heading">{t('auth.codeTitle')}</Text>
              <Row gap={2} wrap>
                <Text muted>{t('auth.codeSentTo')}</Text>
                <Pressable onPress={() => { otp.changeNumber(); setCode(''); }} accessibilityRole="button"
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
                if (otp.problem) otp.clearProblem();
                if (v.length === 6 && otp.codeUsable) void verify(v);
              }}
              error={!!error}
              autoFocus
              testID="otp-input"
            />
            {error ? <Banner tone="danger">{error}</Banner> : null}
            {otp.codeUsable ? (
              <Text variant="caption" muted center testID="otp-expiry">
                {t('auth.expiresIn', { time: formatCountdown(otp.expiresIn) })}
              </Text>
            ) : null}
            <Button title={t('auth.verify')} size="lg" onPress={() => void verify()} loading={otp.busy}
                    disabled={code.length !== 6 || !otp.codeUsable} testID="verify-code" />
            <Button
              title={otp.resendWait > 0 ? t('auth.resendIn', { time: formatCountdown(otp.resendWait) }) : t('auth.resend')}
              variant={otp.codeUsable ? 'ghost' : 'outline'}
              onPress={() => void resend()}
              disabled={otp.busy || otp.resendWait > 0}
              testID="resend-code"
            />
          </>
        )}
        <Text variant="caption" tone="faint" center style={{ paddingBottom: 24 }}>{t('auth.legal')}</Text>
      </View>
    </Screen>
  );
}
