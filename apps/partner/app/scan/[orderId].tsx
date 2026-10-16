import { Banner, Button, Screen, Text } from '@lunchbox/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { currentPosition } from '../../src/lib/locationTask';
import { runOrQueue } from '../../src/lib/offlineQueue';
import { errorMessage } from '../../src/lib/queryClient';

/** Scans the parent's short-lived signed QR and confirms the pickup. */
export default function ScanScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Screen>
        <Text>Camera access is needed to scan the pickup QR.</Text>
        <Button title="Allow camera" onPress={() => void requestPermission()} />
      </Screen>
    );
  }

  async function onScanned(data: string) {
    if (handled.current || !data.startsWith('LB1.')) return;
    handled.current = true;
    try {
      await runOrQueue({ kind: 'pickup', orderId, body: { method: 'QR', code: data, location: await currentPosition() } });
      await qc.invalidateQueries({ queryKey: ['route'] });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      handled.current = false;
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => void onScanned(data)}
      />
      {error ? (
        <View style={{ position: 'absolute', bottom: 40, left: 16, right: 16 }}>
          <Banner tone="danger">{error}</Banner>
        </View>
      ) : null}
    </View>
  );
}
