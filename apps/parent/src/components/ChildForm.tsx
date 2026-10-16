import { zodResolver } from '@hookform/resolvers/zod';
import type { ChildRequest, ChildResponse } from '@lunchbox/api-client';
import { Banner, Button, Card, Text, TextField } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { api } from '../lib/api';

const NAME = /^[\p{L}\p{M} .'-]{1,80}$/u;

const schema = z.object({
  schoolId: z.string().uuid(),
  firstName: z.string().trim().regex(NAME),
  lastName: z.string().trim().regex(NAME).or(z.literal('')).optional(),
  className: z.string().trim().min(1).max(20),
  section: z.string().trim().max(10).optional(),
  rollNumber: z.string().trim().max(20).regex(/^[A-Za-z0-9/-]*$/).optional(),
  allergiesNote: z.string().trim().max(1000).optional(),
});

export type ChildFormValues = z.infer<typeof schema>;

export function ChildForm({
  initial,
  onSubmit,
  error,
}: {
  initial?: ChildResponse;
  onSubmit: (values: ChildRequest) => Promise<void>;
  error?: string | null;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [schoolName, setSchoolName] = useState(initial?.schoolName ?? '');
  const schools = useQuery({
    queryKey: ['schools', query],
    queryFn: () => api.schools.search(query),
    enabled: query.length >= 2,
  });
  const { control, handleSubmit, setValue, formState } = useForm<ChildFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      schoolId: initial?.schoolId ?? '',
      firstName: initial?.firstName ?? '',
      lastName: initial?.lastName ?? '',
      className: initial?.className ?? '',
      section: initial?.section ?? '',
      rollNumber: initial?.rollNumber ?? '',
      allergiesNote: initial?.allergiesNote ?? '',
    },
  });

  const submit = handleSubmit((v) =>
    onSubmit({
      schoolId: v.schoolId,
      firstName: v.firstName,
      lastName: v.lastName || undefined,
      className: v.className,
      section: v.section || undefined,
      rollNumber: v.rollNumber || undefined,
      allergiesNote: v.allergiesNote || undefined,
    }),
  );

  const field = (name: keyof ChildFormValues, label: string, props: object = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: f, fieldState }) => (
        <TextField label={label} value={f.value ?? ''} onChangeText={f.onChange}
                   error={fieldState.error ? label : undefined} {...props} />
      )}
    />
  );

  return (
    <>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {field('firstName', t('children.firstName'), { testID: 'child-first-name' })}
      {field('lastName', t('children.lastName'))}
      <TextField label={t('children.school')} placeholder={t('children.searchSchool')}
                 value={schoolName || query} onChangeText={(v) => { setSchoolName(''); setQuery(v); }}
                 error={formState.errors.schoolId ? t('children.school') : undefined} testID="school-search" />
      {!schoolName && schools.data?.items.map((s) => (
        <Card key={s.id} onPress={() => { setValue('schoolId', s.id, { shouldValidate: true }); setSchoolName(s.name); }}
              accessibilityLabel={s.name}>
          <Text variant="label">{s.name}</Text>
          <Text variant="caption" muted>{s.addressLine}, {s.city}</Text>
        </Card>
      ))}
      {field('className', t('children.className'), { testID: 'child-class' })}
      {field('section', t('children.section'))}
      {field('rollNumber', t('children.rollNumber'))}
      {field('allergiesNote', t('children.allergies'), { multiline: true })}
      <Button title={t('common.save')} onPress={submit} loading={formState.isSubmitting} testID="child-save" />
    </>
  );
}
