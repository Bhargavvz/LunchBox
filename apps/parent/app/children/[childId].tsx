import { Button, Loading } from '@lunchbox/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react-native';
import { Alert } from 'react-native';
import { ChildForm } from '../../src/components/ChildForm';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

export default function EditChildScreen() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const child = useQuery({ queryKey: ['child', childId], queryFn: () => api.children.get(childId) });

  if (child.isLoading || !child.data) return <Loading label={t('common.loading')} />;

  const remove = () =>
    Alert.alert(t('children.remove'), t('children.removeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.children.remove(childId);
            await qc.invalidateQueries({ queryKey: ['children'] });
            await qc.invalidateQueries({ queryKey: ['subscriptions'] });
            router.back();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);

  return (
    <ChildForm
      initial={child.data}
      error={error}
      onSubmit={async (values) => {
        try {
          await api.children.update(childId, values);
          await qc.invalidateQueries({ queryKey: ['children'] });
          await qc.invalidateQueries({ queryKey: ['child', childId] });
          router.back();
        } catch (e) {
          setError(errorMessage(e));
        }
      }}
      footerExtra={<Button title={t('children.remove')} variant="dangerSoft" icon={Trash2} onPress={remove} />}
    />
  );
}
