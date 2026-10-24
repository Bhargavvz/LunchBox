import { zodResolver } from '@hookform/resolvers/zod';
import type { ChildRequest, ChildResponse } from '@lunchbox/api-client';
import {
  Avatar,
  Banner,
  Button,
  Icon,
  ListGroup,
  ListItem,
  Row,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
  TextField,
  useTheme,
} from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, School, Search } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
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

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Full-screen child form (create and edit); `footerExtra` adds e.g. the remove action under Save. */
export function ChildForm({
  initial,
  onSubmit,
  error,
  footerExtra,
}: {
  initial?: ChildResponse;
  onSubmit: (values: ChildRequest) => Promise<void>;
  error?: string | null;
  footerExtra?: ReactNode;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [school, setSchool] = useState<{ name: string; place: string } | null>(
    initial ? { name: initial.schoolName ?? '', place: '' } : null,
  );
  const search = useDebounced(query.trim(), 250);
  const schools = useQuery({
    queryKey: ['schools', search],
    queryFn: () => api.schools.search(search),
    enabled: search.length >= 2 && !school,
  });
  const { control, handleSubmit, setValue, watch, formState } = useForm<ChildFormValues>({
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
  const preview = [watch('firstName'), watch('lastName')].filter(Boolean).join(' ').trim();

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

  const field = (name: keyof ChildFormValues, label: string, errorText: string, props: object = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: f, fieldState }) => (
        <TextField label={label} value={f.value ?? ''} onChangeText={f.onChange} onBlur={f.onBlur}
                   error={fieldState.error ? errorText : undefined} {...props} />
      )}
    />
  );

  return (
    <Screen
      keyboard
      footer={
        <>
          <Button title={t('common.save')} size="lg" onPress={submit} loading={formState.isSubmitting} testID="child-save" />
          {footerExtra}
        </>
      }
    >
      <Row gap={3.5}>
        <Avatar name={preview || '?'} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading" numberOfLines={1}>{preview || t('children.newChild')}</Text>
          <Text variant="caption" muted numberOfLines={1}>{school?.name || t('children.chooseSchoolHint')}</Text>
        </View>
      </Row>
      {error ? <Banner tone="danger" title={t('common.problem')}>{error}</Banner> : null}

      <SectionHeader title={t('children.about')} />
      {field('firstName', t('children.firstName'), t('children.errors.firstName'),
        { testID: 'child-first-name', autoCapitalize: 'words', autoFocus: !initial })}
      {field('lastName', t('children.lastName'), t('children.errors.lastName'), { autoCapitalize: 'words' })}

      <SectionHeader title={t('children.school')} />
      {school ? (
        <Row gap={3} style={{ backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.md, padding: 14 }}>
          <Icon as={CircleCheck} size={20} color="onPrimarySoft" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" style={{ color: theme.colors.onPrimarySoft }}>{school.name}</Text>
            {school.place ? <Text variant="caption" style={{ color: theme.colors.onPrimarySoft, opacity: 0.8 }}>{school.place}</Text> : null}
          </View>
          <Pressable onPress={() => { setSchool(null); setValue('schoolId', ''); }} accessibilityRole="button"
                     accessibilityLabel={t('children.changeSchool')} hitSlop={8}>
            <Text variant="label" tone="primary">{t('common.change')}</Text>
          </Pressable>
        </Row>
      ) : (
        <>
          <TextField label={t('children.searchSchool')} icon={Search} placeholder={t('children.searchPlaceholder')}
                     value={query} onChangeText={setQuery} autoCorrect={false}
                     error={formState.errors.schoolId ? t('children.errors.school') : undefined} testID="school-search" />
          {schools.isFetching && !schools.data ? (
            <View style={{ gap: 8 }}>
              <Skeleton height={56} radius={14} />
              <Skeleton height={56} radius={14} />
            </View>
          ) : null}
          {schools.data && schools.data.items.length > 0 ? (
            <ListGroup>
              {schools.data.items.map((s) => (
                <ListItem
                  key={s.id}
                  icon={School}
                  iconTone="neutral"
                  title={s.name}
                  subtitle={[s.addressLine, s.city].filter(Boolean).join(', ')}
                  chevron={false}
                  onPress={() => {
                    setValue('schoolId', s.id, { shouldValidate: true });
                    setSchool({ name: s.name, place: [s.addressLine, s.city].filter(Boolean).join(', ') });
                    setQuery('');
                  }}
                />
              ))}
            </ListGroup>
          ) : null}
          {schools.data && schools.data.items.length === 0 ? (
            <Text variant="caption" muted>{t('children.noSchools')}</Text>
          ) : null}
        </>
      )}

      <SectionHeader title={t('children.classDetails')} />
      <Row gap={3} align="flex-start">
        <View style={{ flex: 1.2 }}>{field('className', t('children.className'), t('children.errors.className'), { testID: 'child-class' })}</View>
        <View style={{ flex: 1 }}>{field('section', t('children.section'), t('children.errors.section'), { autoCapitalize: 'characters' })}</View>
      </Row>
      {field('rollNumber', t('children.rollNumber'), t('children.errors.rollNumber'), { autoCapitalize: 'characters' })}

      <SectionHeader title={t('children.notes')} />
      {field('allergiesNote', t('children.allergies'), t('children.errors.allergies'),
        { multiline: true, maxLength: 1000, counter: true, hint: t('children.allergiesHint') })}
    </Screen>
  );
}
