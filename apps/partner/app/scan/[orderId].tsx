import { Banner, Button, EmptyState, IconButton, Screen, Text, TiffinArt, haptic, palette, useToast } from '@lunchbox/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, Flashlight, FlashlightOff } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { currentPosition } from '../../src/lib/locationTask';
import { runOrQueue } from '../../src/lib/offlineQueue';
import { errorMessage } from '../../src/lib/queryClient';

const SHADE = 'rgba(12,11,10,0.62)';
const CORNER = 34;

/** Scans the parent's short-lived signed QR and confirms the pickup. */
export default function ScanScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);
  const sweep = useRef(new Animated.Value(0)).current;
  const frame = Math.min(270, width - 96);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(sweep, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(sweep, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Screen safeTop>
        <EmptyState art={<TiffinArt size={88} mood="accent" />} title={t('scan.permissionTitle')} message={t('scan.permission')}
                    action={<Button title={t('scan.allow')} icon={Camera} size="lg" onPress={() => void requestPermission()} />} />
      </Screen>
    );
  }

  async function onScanned(data: string) {
    if (handled.current || !data.startsWith('LB1.')) return;
    handled.current = true;
    setBusy(true);
    haptic.press();
    try {
      const { queued } = await runOrQueue({ kind: 'pickup', orderId, body: { method: 'QR', code: data, location: await currentPosition() } });
      await qc.invalidateQueries({ queryKey: ['route'] });
      toast(queued ? t('stop.queued') : t('stop.pickedUp'), queued ? 'info' : 'success');
      router.back();
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
      handled.current = false;
    } finally {
      setBusy(false);
    }
  }

  const corner = (pos: object, edges: object) => (
    <View style={[{ position: 'absolute', width: CORNER, height: CORNER, borderColor: '#FFFFFF' }, pos, edges]} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : ({ data }) => void onScanned(data)}
      />
      {/* Shade everything except the square viewfinder. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 1, backgroundColor: SHADE }} />
        <View style={{ flexDirection: 'row', height: frame }}>
          <View style={{ flex: 1, backgroundColor: SHADE }} />
          <View style={{ width: frame, height: frame }}>
            {corner({ top: 0, left: 0 }, { borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 })}
            {corner({ top: 0, right: 0 }, { borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 })}
            {corner({ bottom: 0, left: 0 }, { borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 })}
            {corner({ bottom: 0, right: 0 }, { borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 })}
            <Animated.View style={{ position: 'absolute', left: 14, right: 14, height: 2, borderRadius: 1, backgroundColor: palette.turmeric500,
              opacity: busy ? 0 : 0.9, transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [14, frame - 16] }) }] }} />
          </View>
          <View style={{ flex: 1, backgroundColor: SHADE }} />
        </View>
        <View style={{ flex: 1, backgroundColor: SHADE, alignItems: 'center', paddingTop: 28, paddingHorizontal: 32, gap: 6 }}>
          <Text variant="heading" center style={{ color: '#FFFFFF' }}>{busy ? t('scan.checking') : t('scan.aim')}</Text>
          <Text variant="caption" center style={{ color: 'rgba(255,255,255,0.75)' }}>{t('scan.hint')}</Text>
        </View>
      </View>
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 20, gap: 12, alignItems: 'center' }}>
        {error ? <View style={{ alignSelf: 'stretch' }}><Banner tone="danger">{error}</Banner></View> : null}
        <IconButton icon={torch ? FlashlightOff : Flashlight} label={torch ? t('scan.torchOff') : t('scan.torchOn')} tone="plain"
                    size={56} onPress={() => setTorch((v) => !v)} />
      </View>
    </View>
  );
}
