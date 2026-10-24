import { zodResolver } from '@hookform/resolvers/zod';
import { Banner, Button, ListGroup, PageTitle, Screen, SegmentedControl, Text, TextField, ToggleRow } from '@lunchbox/ui';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { z } from 'zod';
import { StepHeader } from '../../src/components/StepHeader';
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
    <Screen
      safeTop
      keyboard
      footer={<Button title={t('common.continue')} size="lg" onPress={onSubmit} loading={formState.isSubmitting} testID="register-submit" />}
    >
      <StepHeader step={1} of={2} />
      <PageTitle title={t('register.title')} subtitle={t('register.subtitle')} />
      {error ? <Banner tone="danger" title={t('common.problem')}>{error}</Banner> : null}
      <Controller control={control} name="firstName" render={({ field, fieldState }) => (
        <TextField label={t('register.firstName')} value={field.value} onChangeText={field.onChange} autoFocus
                   error={fieldState.error ? t('register.firstNameError') : undefined} autoComplete="given-name"
                   autoCapitalize="words" returnKeyType="next" testID="first-name" />
      )} />
      <Controller control={control} name="lastName" render={({ field }) => (
        <TextField label={t('register.lastName')} value={field.value ?? ''} onChangeText={field.onChange}
                   autoComplete="family-name" autoCapitalize="words" />
      )} />
      <View style={{ gap: 8 }}>
        <Text variant="label">{t('register.language')}</Text>
        <Controller control={control} name="language" render={({ field }) => (
          <SegmentedControl
            options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]}
            value={field.value}
            onChange={(v) => {
              field.onChange(v);
              void i18n.changeLanguage(v);
            }}
          />
        )} />
      </View>
      <Controller control={control} name="terms" render={({ field }) => (
        <ListGroup>
          <ToggleRow title={t('register.termsTitle')} description={t('register.terms')} value={field.value === true}
                     onChange={field.onChange} testID="terms" />
        </ListGroup>
      )} />
      {formState.errors.terms ? <Banner tone="danger">{t('register.termsRequired')}</Banner> : null}
    </Screen>
  );
}
