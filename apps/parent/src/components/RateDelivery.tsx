import { Banner, Button, Card, PressableScale, Row, Text, TextField, haptic, useTheme } from '@lunchbox/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api } from '../lib/api';
import { errorMessage } from '../lib/queryClient';

const STARS = [1, 2, 3, 4, 5] as const;

function Stars({ value, size, onPick }: { value: number; size: number; onPick?: (n: number) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Row gap={onPick ? 2 : 1} accessibilityRole={onPick ? 'radiogroup' : undefined}>
      {STARS.map((n) => {
        const on = n <= value;
        const glyph = (
          <Star size={size} strokeWidth={1.8} color={on ? theme.colors.accent : theme.colors.borderStrong}
                fill={on ? theme.colors.accent : 'transparent'} />
        );
        return onPick ? (
          <PressableScale key={n} onPress={() => onPick(n)} scaleTo={0.85} hitSlop={6} accessibilityRole="radio"
                          accessibilityState={{ selected: value === n }}
                          accessibilityLabel={t('rating.starsLabel', { count: n })} testID={`rate-star-${n}`}>
            {glyph}
          </PressableScale>
        ) : (
          <View key={n}>{glyph}</View>
        );
      })}
    </Row>
  );
}

/** One-time rating of a delivered order. Shows the submitted rating once the parent has rated. */
export function RateDelivery({ orderId, rated, canRate }: { orderId: string; rated: number | null; canRate: boolean }) {
  const { t } = useTranslation();
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
      <Card tone="sunken">
        <Row justify="space-between">
          <Text variant="label" muted>{t('rating.yours')}</Text>
          <View accessible accessibilityLabel={t('rating.starsLabel', { count: rated })}>
            <Stars value={rated} size={18} />
          </View>
        </Row>
      </Card>
    );
  }
  if (!canRate) return null;

  return (
    <Card tone="raised">
      <Text variant="heading">{t('rating.title')}</Text>
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}>
        <Stars value={stars} size={38} onPick={(n) => { haptic.tap(); setStars(n); }} />
        <Text variant="label" muted style={{ minHeight: 20 }}>{stars > 0 ? t(`rating.word.${stars}`) : ' '}</Text>
      </View>
      {stars > 0 ? (
        <TextField label={t('rating.comment')} value={comment} onChangeText={setComment} maxLength={500} multiline counter />
      ) : null}
      {submit.error ? <Banner tone="danger">{errorMessage(submit.error)}</Banner> : null}
      <Button title={t('rating.submit')} disabled={stars === 0} loading={submit.isPending}
              onPress={() => submit.mutate()} testID="rate-submit" />
    </Card>
  );
}
