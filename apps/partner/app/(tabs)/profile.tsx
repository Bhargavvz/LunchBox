import {
  Avatar,
  Banner,
  Button,
  Card,
  Icon,
  ListGroup,
  ListItem,
  Loading,
  PageTitle,
  Row,
  Screen,
  SectionHeader,
  SegmentedControl,
  Stat,
  Text,
  Wordmark,
  useTheme,
} from '@lunchbox/ui';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { CloudOff, LogOut, RefreshCw, Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { setLanguage } from '../../src/i18n';
import { api } from '../../src/lib/api';
import { signOut } from '../../src/lib/firebase';
import { stopRouteTracking } from '../../src/lib/locationTask';
import { useActionQueue } from '../../src/lib/offlineQueue';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const me = useQuery({ queryKey: ['partner', 'me'], queryFn: api.partner.me });
  const items = useActionQueue((s) => s.items);
  const failed = useActionQueue((s) => s.failed);
  const flush = useActionQueue((s) => s.flush);
  const dismiss = useActionQueue((s) => s.dismissFailed);

  if (me.isLoading) return <Loading safeTop label={t('common.loading')} />;
  const p = me.data;
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ');

  return (
    <Screen safeTop gap={5}>
      <PageTitle title={t('profile.title')} />

      <Card tone="raised" gap={4}>
        <Row gap={3.5}>
          <Avatar name={name || 'Partner'} size={60} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" numberOfLines={1}>{name}</Text>
            <Text variant="caption" muted>
              {[p?.vehicleType ? t(`profile.vehicleType.${p.vehicleType}`) : null, p?.vehicleNumber].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Row>
        <Row justify="space-between" style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Stat label={t('profile.rating')} value={p?.rating ? Number(p.rating).toFixed(1) : '—'} />
          </View>
          <View style={{ flex: 1 }}>
            <Stat label={t('profile.capacity')} value={String(p?.capacity ?? '—')} hint={t('profile.capacityHint')} />
          </View>
        </Row>
        {p?.rating ? (
          <Row gap={1}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={14} color={theme.colors.accent} fill={n <= Math.round(Number(p.rating)) ? theme.colors.accent : 'transparent'} />
            ))}
          </Row>
        ) : null}
      </Card>

      {items.length > 0 || failed.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title={t('profile.sync')} />
          {items.length > 0 ? (
            <Card tone="accent" gap={3}>
              <Row gap={2.5}>
                <Icon as={CloudOff} size={20} color="onAccentSoft" />
                <Text variant="bodyStrong" style={{ flex: 1, color: theme.colors.onAccentSoft }}>
                  {t('profile.pendingSync', { count: items.length })}
                </Text>
              </Row>
              {items.map((i) => (
                <Text key={i.id} variant="caption" style={{ color: theme.colors.onAccentSoft }}>
                  {t(`profile.actions.${i.action.kind}`)} · {t('profile.attempts', { count: i.attempts })}
                  {i.lastError ? ` · ${i.lastError}` : ''}
                </Text>
              ))}
              <Button title={t('profile.syncNow')} variant="secondary" icon={RefreshCw} onPress={() => void flush()} />
            </Card>
          ) : null}
          {failed.map((f) => (
            <Banner key={f.id} tone="danger" title={t(`profile.actions.${f.action.kind}`)}
                    action={<Button title={t('profile.dismiss')} variant="ghost" size="sm" inline onPress={() => dismiss(f.id)} />}>
              {f.lastError}
            </Banner>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionHeader title={t('profile.language')} />
        <Card>
          <SegmentedControl
            options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]}
            value={i18n.language === 'hi' ? 'hi' : 'en'}
            onChange={(v) => void setLanguage(v as 'en' | 'hi')}
          />
        </Card>
      </View>

      <ListGroup>
        <ListItem icon={LogOut} destructive title={t('profile.signOut')} onPress={async () => {
          await stopRouteTracking();
          await signOut();
        }} />
      </ListGroup>

      <View style={{ alignItems: 'center', gap: 6, paddingTop: 8 }}>
        <Wordmark size={18} />
        <Text variant="caption" tone="faint">{t('profile.version', { version: Constants.expoConfig?.version ?? '' })}</Text>
      </View>
    </Screen>
  );
}
