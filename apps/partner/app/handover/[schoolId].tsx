import { Banner, Button, Screen, Text } from '@lunchbox/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import { api } from '../../src/lib/api';
import { currentPosition } from '../../src/lib/locationTask';
import { runOrQueue } from '../../src/lib/offlineQueue';
import { errorMessage } from '../../src/lib/queryClient';

/**
 * Handover: photo → compressed JPEG → direct upload to the private S3 bucket via pre-signed PUT → handover call with
 * the object key and current GPS (server checks the school geofence).
 */
export default function HandoverScreen() {
  const { schoolId } = useLocalSearchParams<{ schoolId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Screen>
        <Text>{t('handover.hint')}</Text>
        <Button title="Allow camera" onPress={() => void requestPermission()} />
      </Screen>
    );
  }

  async function capture() {
    const shot = await camera.current?.takePictureAsync({ quality: 0.7, skipProcessing: true });
    if (!shot) return;
    const small = await manipulateAsync(shot.uri, [{ resize: { width: 1280 } }], { compress: 0.7, format: SaveFormat.JPEG });
    setPhoto(small.uri);
  }

  async function submit() {
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      const upload = await api.partner.handoverUploadUrl();
      const result = await FileSystem.uploadAsync(upload.url, photo, {
        httpMethod: 'PUT',
        headers: upload.headers,
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Photo upload failed (${result.status})`);
      }
      const location = await currentPosition();
      const { queued } = await runOrQueue({ kind: 'handover', schoolId, body: { photoKey: upload.key, location } });
      await qc.invalidateQueries({ queryKey: ['route'] });
      if (!queued) router.back();
      else setError(t('stop.queued'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {photo ? (
        <Image source={{ uri: photo }} style={{ flex: 1 }} accessibilityLabel={t('handover.title')} />
      ) : (
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
      )}
      <View style={{ padding: 16, gap: 12 }}>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Text muted>{t('handover.hint')}</Text>
        {photo ? (
          <>
            <Button title={busy ? t('handover.uploading') : t('handover.submit')} loading={busy} onPress={submit} testID="submit-handover" />
            <Button title={t('handover.retake')} variant="ghost" onPress={() => setPhoto(null)} disabled={busy} />
          </>
        ) : (
          <Button title={t('handover.capture')} onPress={capture} testID="capture" />
        )}
      </View>
    </View>
  );
}
