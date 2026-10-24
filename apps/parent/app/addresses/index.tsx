import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Icon,
  Loading,
  Row,
  Screen,
  Text,
  TiffinArt,
  useTheme,
  useToast,
} from '@lunchbox/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Building2, House, MapPin, MessageSquareText, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

function glyphFor(label: string) {
  const l = label.toLowerCase();
  if (l.includes('home') || l.includes('घर')) return House;
  if (l.includes('work') || l.includes('office') || l.includes('ऑफ़िस')) return Building2;
  return MapPin;
}

export default function AddressesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['addresses'], queryFn: api.addresses.list });
  const remove = useMutation({
    mutationFn: api.addresses.remove,
    onSuccess: () => {
      toast(t('address.removed'));
      return qc.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
  if (list.isLoading) return <Loading label={t('common.loading')} />;

  const confirmRemove = (id: string, label: string) =>
    Alert.alert(t('address.removeTitle'), t('address.removeConfirm', { label }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate(id) },
    ]);

  const items = list.data ?? [];
  return (
    <Screen
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      footer={<Button title={t('address.add')} icon={Plus} size="lg" onPress={() => router.push('/addresses/new')} testID="add-address" />}
    >
      {list.error ? <Banner tone="danger">{errorMessage(list.error)}</Banner> : null}
      {remove.error ? <Banner tone="danger">{errorMessage(remove.error)}</Banner> : null}
      {list.data && items.length === 0 ? (
        <EmptyState art={<TiffinArt size={88} mood="accent" />} title={t('address.emptyTitle')} message={t('address.emptyHint')} />
      ) : null}
      {items.map((a) => (
        <Card key={a.id} tone="raised" gap={3}>
          <Row gap={3} align="flex-start">
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: theme.colors.accentSoft,
              alignItems: 'center', justifyContent: 'center' }}>
              <Icon as={glyphFor(a.label)} size={20} color="onAccentSoft" />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Row gap={2}>
                <Text variant="heading">{a.label}</Text>
                {a.isDefault ? <Badge label={t('address.default')} tone="primary" /> : null}
              </Row>
              <Text>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</Text>
              <Text variant="caption" muted>{a.landmark ? `${a.landmark} · ` : ''}{a.city} {a.pincode}</Text>
            </View>
          </Row>
          {a.instructions ? (
            <Row gap={2} align="flex-start" style={{ backgroundColor: theme.colors.sunken, borderRadius: theme.radius.sm, padding: 10 }}>
              <Icon as={MessageSquareText} size={15} color="textMuted" />
              <Text variant="caption" muted style={{ flex: 1 }}>{a.instructions}</Text>
            </Row>
          ) : null}
          <Row justify="flex-end">
            <Button title={t('address.remove')} variant="ghost" size="sm" inline
                    loading={remove.isPending && remove.variables === a.id} onPress={() => confirmRemove(a.id, a.label)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
