import { zodResolver } from '@hookform/resolvers/zod';
import { Banner, Button, Row, Screen, Text, TextField } from '@lunchbox/ui';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch } from 'react-native';
import { z } from 'zod';
import { api } from '../../src/lib/api';
import { config } from '../../src/lib/config';
import { errorMessage } from '../../src/lib/queryClient';
import { useSession } from '../../src/lib/session';

const NAME = /^[\p{L}\p{M} .'-]{1,80}$/u;

const schema = z.object({
  firstName: z.string().trim().regex(NAME),
  lastName: z.string().trim().regex(NAME).optional().or(z.literal('')),
  language: z.enum(['en', 'hi']),
  terms: z.literal(true),
});

type Form = z.infer<typeof schema>;

export default function RegisterScreen() {
  const { t, i18n } = useTranslation();
  const refresh = useSession((s) => s.refresh);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', language: i18n.language === 'hi' ? 'hi' : 'en', terms: false as never },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api.auth.registerParent({
        firstName: values.firstName,
        lastName: values.lastName || undefined,
        preferredLanguage: values.language,
        policyVersion: config.policyVersion,
        consents: [{ purpose: 'ACCOUNT_AND_SERVICE', granted: true }],
      });
      await i18n.changeLanguage(values.language);
      await refresh(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Screen>
      <Text variant="title">{t('register.title')}</Text>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Controller control={control} name="firstName" render={({ field, fieldState }) => (
        <TextField label={t('register.firstName')} value={field.value} onChangeText={field.onChange}
                   error={fieldState.error ? t('register.firstName') : undefined} autoComplete="given-name" testID="first-name" />
      )} />
      <Controller control={control} name="lastName" render={({ field }) => (
        <TextField label={t('register.lastName')} value={field.value ?? ''} onChangeText={field.onChange} autoComplete="family-name" />
      )} />
      <Text variant="label">{t('register.language')}</Text>
      <Controller control={control} name="language" render={({ field }) => (
        <Row>
          {(['en', 'hi'] as const).map((lang) => (
            <Pressable key={lang} accessibilityRole="radio" accessibilityState={{ selected: field.value === lang }}
                       onPress={() => field.onChange(lang)} style={{ padding: 8 }}>
              <Text variant="label" muted={field.value !== lang}>{lang === 'en' ? 'English' : 'हिन्दी'}</Text>
            </Pressable>
          ))}
        </Row>
      )} />
      <Controller control={control} name="terms" render={({ field }) => (
        <Row>
          <Switch value={field.value === true} onValueChange={field.onChange} accessibilityLabel={t('register.terms')} testID="terms" />
          <Text style={{ flex: 1 }}>{t('register.terms')}</Text>
        </Row>
      )} />
      {formState.errors.terms ? <Banner tone="danger">{t('register.termsRequired')}</Banner> : null}
      <Button title={t('common.continue')} onPress={onSubmit} loading={formState.isSubmitting} testID="register-submit" />
    </Screen>
  );
}
