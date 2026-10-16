import { Banner, Button, Card, EmptyState, Loading, Screen, Text } from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

export default function ChildrenScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const children = useQuery({ queryKey: ['children'], queryFn: api.children.list });
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: api.subscriptions.list });

  if (children.isLoading) return <Loading />;
  const live = new Set(
    (subs.data ?? []).filter((s) => ['ACTIVE', 'PENDING_PAYMENT', 'PAUSED', 'HALTED'].includes(s.status)).map((s) => s.childId),
  );
  return (
    <Screen>
      <Text variant="title">{t('children.title')}</Text>
      {children.error ? <Banner tone="danger">{errorMessage(children.error)}</Banner> : null}
      {children.data?.length === 0 ? <EmptyState title={t('children.add')} /> : null}
      {children.data?.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/children/${c.id}`)} accessibilityLabel={c.firstName}>
          <Text variant="heading">
            {c.firstName} {c.lastName ?? ''}
          </Text>
          <Text muted>
            {c.schoolName} · {t('children.className')} {c.className}
            {c.section ? `-${c.section}` : ''}
          </Text>
          {live.has(c.id) ? (
            <Text variant="label">{t('children.planActive')}</Text>
          ) : (
            <Button title={t('children.subscribe')} variant="secondary" onPress={() => router.push(`/subscribe/${c.id}`)}
                    testID={`subscribe-${c.id}`} />
          )}
        </Card>
      ))}
      <Button title={t('children.add')} onPress={() => router.push('/children/new')} testID="add-child" />
    </Screen>
  );
}
