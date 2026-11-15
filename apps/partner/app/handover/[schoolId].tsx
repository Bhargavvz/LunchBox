import type { TodayRoute } from '@lunchbox/api-client';
import {
  Banner,
  BoxMark,
  Button,
  EmptyState,
  Icon,
  ListGroup,
  PressableScale,
  Row,
  Screen,
  SlideToConfirm,
  Text,
  TiffinArt,
  haptic,
  useTheme,
  useToast,
} from '@lunchbox/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, Check, CircleCheck, MapPin, RotateCcw } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { api } from '../../src/lib/api';
import { currentPosition } from '../../src/lib/locationTask';
import { runOrQueue } from '../../src/lib/offlineQueue';
import { errorMessage } from '../../src/lib/queryClient';

type Stage = 'idle' | 'uploading' | 'confirming';

/**
 * Handover: photo → compressed JPEG → direct upload to the private S3 bucket via pre-signed PUT → handover call with
 * the object key and current GPS (server checks the school geofence).
 */
export default function HandoverScreen() {
  const { schoolId } = useLocalSearchParams<{ schoolId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const route = useQuery<TodayRoute>({ queryKey: ['route'], queryFn: api.partner.todayRoute });
  const boxes = route.data?.stops.find((st) => st.drop?.schoolId === schoolId)?.drop?.boxes
    .filter((b) => b.orderStatus !== 'CANCELLED' && b.orderStatus !== 'PICKUP_FAILED') ?? [];
  const left = boxes.filter((b) => !ticked.has(b.orderId)).length;
  const busy = stage !== 'idle';
  const toggle = (orderId: string) => {
    haptic.tap();
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Screen>
        <EmptyState art={<TiffinArt size={88} mood="accent" />} title={t('handover.permissionTitle')} message={t('handover.hint')}
                    action={<Button title={t('scan.allow')} icon={Camera} size="lg" onPress={() => void requestPermission()} />} />
      </Screen>
    );
  }

  async function capture() {
    setCapturing(true);
    try {
      haptic.press();
      const shot = await camera.current?.takePictureAsync({ quality: 0.7, skipProcessing: true });
      if (!shot) return;
      const small = await manipulateAsync(shot.uri, [{ resize: { width: 1280 } }], { compress: 0.7, format: SaveFormat.JPEG });
      setPhoto(small.uri);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCapturing(false);
    }
  }

  async function submit() {
    if (!photo) return;
    setStage('uploading');
    setError(null);
    try {
      const upload = await api.partner.handoverUploadUrl();
      const result = await FileSystem.uploadAsync(upload.url, photo, {
        httpMethod: 'PUT',
        headers: upload.headers,
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });
      if (result.status < 200 || result.status >= 300) {
        throw new Error(t('handover.uploadFailed', { status: result.status }));
      }
      setStage('confirming');
      const location = await currentPosition();
      const { queued } = await runOrQueue({ kind: 'handover', schoolId, body: { photoKey: upload.key, location } });
      await qc.invalidateQueries({ queryKey: ['route'] });
      toast(queued ? t('stop.queued') : t('handover.done'), queued ? 'info' : 'success');
      router.back();
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
    } finally {
      setStage('idle');
    }
  }

  return (
    <Screen
      footer={
        photo ? (
          <>
            {busy ? (
              <Text variant="caption" muted center>
                {stage === 'uploading' ? t('handover.uploading') : t('handover.confirming')}
              </Text>
            ) : left > 0 ? (
              <Text variant="caption" tone="accent" center>{t('handover.boxesLeft', { count: left })}</Text>
            ) : null}
            <SlideToConfirm label={t('handover.slide')} tone="success" loading={busy} disabled={left > 0}
                            onConfirm={() => void submit()} testID="submit-handover" />
            <Button title={t('handover.retake')} variant="ghost" icon={RotateCcw} onPress={() => setPhoto(null)} disabled={busy} />
          </>
        ) : undefined
      }
    >
      <View style={{ gap: 4 }}>
        <Text variant="heading">{t('handover.title')}</Text>
        <Text muted>{t('handover.hint')}</Text>
      </View>
      {error ? <Banner tone="danger" title={t('common.problem')}>{error}</Banner> : null}

      {boxes.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Row justify="space-between">
            <Text variant="label" muted>{t('handover.checklist')}</Text>
            <Text variant="label" tone={left === 0 ? 'success' : 'muted'} style={{ fontVariant: ['tabular-nums'] }}>
              {boxes.length - left}/{boxes.length}
            </Text>
          </Row>
          <ListGroup>
            {boxes.map((b) => {
              const on = ticked.has(b.orderId);
              return (
                <Pressable key={b.orderId} onPress={() => toggle(b.orderId)} accessibilityRole="checkbox"
                           accessibilityState={{ checked: on }} testID={`box-${b.orderId}`}
                           accessibilityLabel={`${b.childFirstName ?? ''} ${b.boxCode ?? ''}`}
                           style={({ pressed }) => ({ backgroundColor: pressed ? theme.colors.sunken : 'transparent' })}>
                  <Row gap={3} style={{ paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 }}>
                    {b.boxCode ? <BoxMark code={b.boxCode} size="sm" /> : null}
                    <Text style={{ flex: 1 }} numberOfLines={1}>
                      {b.childFirstName}{b.className ? `, ${t('stop.classShort', { cls: b.className })}` : ''}
                    </Text>
                    <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: on ? theme.colors.success : 'transparent', borderWidth: on ? 0 : 2,
                      borderColor: theme.colors.borderStrong }}>
                      {on ? <Icon as={Check} size={18} color={theme.dark ? theme.colors.background : theme.colors.onPrimary}
                                  strokeWidth={3} /> : null}
                    </View>
                  </Row>
                </Pressable>
              );
            })}
          </ListGroup>
          {left === 0 && !photo ? <Text variant="caption" muted>{t('handover.needPhoto')}</Text> : null}
        </View>
      ) : null}

      <View style={{ aspectRatio: 3 / 4, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' }}>
        {photo ? (
          <>
            <Image source={{ uri: photo }} style={{ flex: 1 }} accessibilityLabel={t('handover.preview')} />
            <Row gap={1.5} style={{ position: 'absolute', top: 14, left: 14, backgroundColor: 'rgba(20,27,45,0.65)',
              paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
              <CircleCheck size={14} color="#FFFFFF" />
              <Text variant="caption" style={{ color: '#FFFFFF' }}>{t('handover.captured')}</Text>
            </Row>
          </>
        ) : (
          <>
            <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
            {/* Rule-of-thirds guide helps frame the reception desk and the lunchboxes together. */}
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: '33.3%', width: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: '66.6%', width: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '33.3%', height: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '66.6%', height: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
            <View style={{ position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center' }}>
              <PressableScale onPress={() => void capture()} disabled={capturing} scaleTo={0.9} accessibilityRole="button"
                              accessibilityLabel={t('handover.capture')} testID="capture">
                <View style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                    {capturing ? <ActivityIndicator color={theme.colors.primary} /> : null}
                  </View>
                </View>
              </PressableScale>
            </View>
          </>
        )}
      </View>

      <Row gap={2} align="flex-start">
        <Icon as={MapPin} size={16} color="textMuted" />
        <Text variant="caption" muted style={{ flex: 1 }}>{t('handover.geofence')}</Text>
      </Row>
    </Screen>
  );
}
