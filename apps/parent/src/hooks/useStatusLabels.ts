import type { StatusLabels } from '@lunchbox/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const KEYS = [
  'SCHEDULED',
  'ASSIGNED',
  'REASSIGNED',
  'PARTNER_EN_ROUTE',
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_SCHOOL',
  'DELIVERED',
  'CANCELLED',
  'PICKUP_FAILED',
  'DELIVERY_FAILED',
] as const;

export function useStatusLabels(): StatusLabels {
  const { t, i18n } = useTranslation();
  return useMemo(
    () => Object.fromEntries(KEYS.map((k) => [k, t(`status.${k}`)])) as StatusLabels,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n.language],
  );
}
