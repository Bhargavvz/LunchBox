import { Banner, Button, Card, Loading, Row, Screen, Text } from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

export default function AddressesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['addresses'], queryFn: api.addresses.list });
  const remove = useMutation({
    mutationFn: api.addresses.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  });
  if (list.isLoading) return <Loading />;
  return (
    <Screen>
      {list.error ? <Banner tone="danger">{errorMessage(list.error)}</Banner> : null}
      {remove.error ? <Banner tone="danger">{errorMessage(remove.error)}</Banner> : null}
      {list.data?.map((a) => (
        <Card key={a.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="heading">{a.label}</Text>
            {a.isDefault ? <Text variant="caption">{t('address.default')}</Text> : null}
          </Row>
          <Text>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</Text>
          <Text muted>{a.landmark ? `${a.landmark} · ` : ''}{a.city} {a.pincode}</Text>
          {a.instructions ? <Text variant="caption" muted>{a.instructions}</Text> : null}
          <Button title={t('common.delete')} variant="ghost" onPress={() => remove.mutate(a.id)} />
        </Card>
      ))}
      <Button title={t('address.add')} onPress={() => router.push('/addresses/new')} testID="add-address" />
    </Screen>
  );
}
