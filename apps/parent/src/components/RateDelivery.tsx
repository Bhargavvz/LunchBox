import { Banner, Button, Card, Row, Text, TextField, useTheme } from '@lunchbox/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text as RNText } from 'react-native';
import { api } from '../lib/api';
import { errorMessage } from '../lib/queryClient';

const STARS = [1, 2, 3, 4, 5] as const;

/** One-time rating of a delivered order. Shows the submitted rating once the parent has rated. */
export function RateDelivery({ orderId, rated, canRate }: { orderId: string; rated: number | null; canRate: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const qc = useQueryClient();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const submit = useMutation({
    mutationFn: () => api.orders.rate(orderId, { stars, comment: comment.trim() || undefined }),
    onSuccess: (detail) => {
      qc.setQueryData(['order', orderId], detail);
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  if (rated) {
    return (
      <Card>
        <Text variant="label" muted>{t('rating.yours')}</Text>
        <Text variant="heading" accessibilityLabel={t('rating.starsLabel', { count: rated })}>
          {'★'.repeat(rated)}{'☆'.repeat(5 - rated)}
        </Text>
      </Card>
    );
  }
  if (!canRate) return null;

  return (
    <Card>
      <Text variant="heading">{t('rating.title')}</Text>
      <Row>
        {STARS.map((n) => (
          <Pressable key={n} onPress={() => setStars(n)} accessibilityRole="radio"
                     accessibilityState={{ selected: stars === n }}
                     accessibilityLabel={t('rating.starsLabel', { count: n })}
                     hitSlop={8} testID={`rate-star-${n}`}>
            <RNText style={{ fontSize: 32, color: n <= stars ? theme.colors.accent : theme.colors.textMuted }}>
              {n <= stars ? '★' : '☆'}
            </RNText>
          </Pressable>
        ))}
      </Row>
      <TextField label={t('rating.comment')} value={comment} onChangeText={setComment} maxLength={500} multiline />
      {submit.error ? <Banner tone="danger">{errorMessage(submit.error)}</Banner> : null}
      <Button title={t('rating.submit')} disabled={stars === 0} loading={submit.isPending}
              onPress={() => submit.mutate()} testID="rate-submit" />
    </Card>
  );
}
