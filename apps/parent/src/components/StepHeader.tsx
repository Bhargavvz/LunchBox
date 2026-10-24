import { Row, Text, Wordmark, useTheme } from '@lunchbox/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

/** Wordmark plus a segmented progress bar for the short onboarding flow. */
export function StepHeader({ step, of }: { step: number; of: number }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={{ gap: 14 }} accessible accessibilityLabel={t('onboarding.step', { step, of })}>
      <Row justify="space-between">
        <Wordmark size={20} />
        <Text variant="caption" muted>{t('onboarding.step', { step, of })}</Text>
      </Row>
      <Row gap={1.5}>
        {Array.from({ length: of }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2,
            backgroundColor: i < step ? theme.colors.primary : theme.colors.sunken }} />
        ))}
      </Row>
    </View>
  );
}
