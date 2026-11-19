import { zodResolver } from '@hookform/resolvers/zod';
import { Avatar, Banner, Button, Card, OtpInput, Row, Screen, SectionHeader, Text, TextField, useTheme, useToast } from '@lunchbox/ui';
import { Camera, ImageIcon, Phone, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { z } from 'zod';
import { authError } from '../src/components/PhoneSignIn';
import { api } from '../src/lib/api';
import { confirmPhoneChange, startPhoneChange } from '../src/lib/firebase';
import { PhotoPermissionError, compress, openSettings, pickPhoto, uploadProfilePhoto, type PhotoSource } from '../src/lib/photo';
import { errorMessage } from '../src/lib/queryClient';
import { useSession } from '../src/lib/session';

const schema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.union([z.literal(''), z.string().trim().email().max(254)]),
});
type Form = z.infer<typeof schema>;

/** +919876543210 → +91 98765 43210 */
function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** Edit name and email, set or remove the profile photo, and move the account to a new mobile number (OTP-verified). */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const toast = useToast();
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PhotoPermissionError | null>(null);
  const [photoBusy, setPhotoBusy] = useState<'upload' | 'remove' | null>(null);

  const { control, handleSubmit, reset, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', email: '' },
  });
  useEffect(() => {
    if (me) reset({ firstName: me.parent?.firstName ?? '', lastName: me.parent?.lastName ?? '', email: me.email ?? '' });
  }, [me, reset]);

  const name = [me?.parent?.firstName, me?.parent?.lastName].filter(Boolean).join(' ') || me?.displayName || '';

  const save = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.account.update({ firstName: v.firstName, lastName: v.lastName ?? '', email: v.email });
      await refresh();
      toast(t('profile.saved'), 'success');
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  async function changePhoto(source: PhotoSource) {
    setError(null);
    setPermission(null);
    try {
      const picked = await pickPhoto(source);
      if (!picked) return;
      setPhotoBusy('upload');
      await uploadProfilePhoto(await compress(picked));
      await refresh();
      toast(t('profile.photoSaved'), 'success');
    } catch (e) {
      if (e instanceof PhotoPermissionError) setPermission(e);
      else setError(t('profile.photoFailed', { reason: errorMessage(e) }));
    } finally {
      setPhotoBusy(null);
    }
  }

  async function removePhoto() {
    setError(null);
    setPhotoBusy('remove');
    try {
      await api.account.removePhoto();
      await refresh();
      toast(t('profile.photoRemoved'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPhotoBusy(null);
    }
  }

  const field = (key: keyof Form, label: string, message: string, props: object = {}) => (
    <Controller control={control} name={key} render={({ field: f, fieldState }) => (
      <TextField label={label} value={f.value ?? ''} onChangeText={f.onChange} onBlur={f.onBlur}
                 error={fieldState.error ? message : undefined} {...props} />
    )} />
  );

  return (
    <Screen keyboard footer={<Button title={t('common.save')} size="lg" onPress={save} loading={formState.isSubmitting}
                                     disabled={!formState.isDirty} testID="profile-save" />}>
      {error ? <Banner tone="danger" title={t('common.problem')}>{error}</Banner> : null}
      {permission ? (
        <Banner tone="warning" title={t('profile.permissionTitle')}>
          {t(permission.source === 'camera' ? 'profile.cameraDenied' : 'profile.galleryDenied')}
        </Banner>
      ) : null}
      {permission && !permission.canAskAgain ? (
        <Button title={t('profile.openSettings')} variant="outline" onPress={() => void openSettings()} />
      ) : null}

      <Card gap={4}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View>
            <Avatar name={name || 'LunchBox'} size={104} uri={me?.photoUrl} />
            {photoBusy ? (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center',
                backgroundColor: theme.colors.scrim, borderRadius: 104 / 2.6 }}>
                <ActivityIndicator color={theme.colors.onPrimary} />
              </View>
            ) : null}
          </View>
          <Text variant="caption" muted center>{t('profile.photoHint')}</Text>
        </View>
        <Row gap={2}>
          <View style={{ flex: 1 }}>
            <Button title={t('profile.takePhoto')} icon={Camera} variant="secondary" disabled={!!photoBusy}
                    onPress={() => void changePhoto('camera')} testID="photo-camera" />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={t('profile.choosePhoto')} icon={ImageIcon} variant="secondary" disabled={!!photoBusy}
                    onPress={() => void changePhoto('library')} testID="photo-gallery" />
          </View>
        </Row>
        {me?.photoUrl ? (
          <Button title={t('profile.removePhoto')} icon={Trash2} variant="ghost" disabled={!!photoBusy}
                  loading={photoBusy === 'remove'} onPress={() => void removePhoto()} />
        ) : null}
      </Card>

      <SectionHeader title={t('profile.details')} />
      {field('firstName', t('register.firstName'), t('profile.errors.firstName'), { autoComplete: 'given-name', testID: 'profile-first' })}
      {field('lastName', t('register.lastName'), t('profile.errors.lastName'), { autoComplete: 'family-name' })}
      {field('email', t('profile.email'), t('profile.errors.email'),
        { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email', hint: t('profile.emailHint') })}

      <SectionHeader title={t('profile.mobile')} />
      <PhoneChange current={me?.phone} onChanged={async () => {
        await refresh(true);
        toast(t('profile.phoneChanged'), 'success');
      }} />
    </Screen>
  );
}

/** New number → SMS code → Firebase moves the sign-in to it → the server adopts it from the verified token. */
function PhoneChange({ current, onChanged }: { current?: string | null; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'idle' | 'number' | 'code'>('idle');
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e164 = `+91${number.replace(/\D/g, '')}`;
  const valid = /^\+91[6-9]\d{9}$/.test(e164);

  async function send() {
    setError(null);
    if (!valid) return setError(t('auth.invalidPhone'));
    if (e164 === current) return setError(t('profile.samePhone'));
    setBusy(true);
    try {
      setVerificationId(await startPhoneChange(e164));
      setStep('code');
    } catch (e) {
      setError(authError(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!verificationId || code.length !== 6) return;
    setError(null);
    setBusy(true);
    try {
      await confirmPhoneChange(verificationId, code);
      await api.account.syncPhone();
      await onChanged();
      setStep('idle');
      setNumber('');
      setCode('');
    } catch (e) {
      const firebaseCode = (e as { code?: string } | null)?.code ?? '';
      setError(firebaseCode === 'auth/credential-already-in-use' ? t('profile.phoneInUse')
        : firebaseCode.startsWith('auth/') ? authError(e, t) : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card gap={3}>
      <Row gap={2}>
        <Phone size={18} />
        <Text variant="label" style={{ flex: 1, fontVariant: ['tabular-nums'] }}>{formatPhone(current)}</Text>
        {step === 'idle' ? <Button title={t('profile.changePhone')} variant="ghost" size="sm" inline onPress={() => setStep('number')} /> : null}
      </Row>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {step === 'number' ? (
        <>
          <TextField label={t('profile.newPhone')} prefix="+91" keyboardType="phone-pad" maxLength={10} value={number}
                     onChangeText={setNumber} hint={t('profile.newPhoneHint')} autoFocus />
          <Row gap={2}>
            <View style={{ flex: 1 }}><Button title={t('common.cancel')} variant="outline" onPress={() => setStep('idle')} /></View>
            <View style={{ flex: 1 }}><Button title={t('auth.sendCode')} onPress={() => void send()} loading={busy} disabled={!valid} /></View>
          </Row>
        </>
      ) : null}
      {step === 'code' ? (
        <>
          <Text variant="caption" muted>{t('profile.codeSent', { phone: formatPhone(e164) })}</Text>
          <OtpInput value={code} onChange={setCode} label={t('profile.enterCode')} autoFocus />
          <Row gap={2}>
            <View style={{ flex: 1 }}><Button title={t('common.cancel')} variant="outline" onPress={() => setStep('idle')} /></View>
            <View style={{ flex: 1 }}><Button title={t('profile.confirmPhone')} onPress={() => void confirm()} loading={busy} disabled={code.length !== 6} /></View>
          </Row>
        </>
      ) : null}
    </Card>
  );
}
