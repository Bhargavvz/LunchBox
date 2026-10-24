import { Icon, IconButton, elevation, mapStyle, useTheme } from '@lunchbox/ui';
import { Bike, House, LocateFixed, School } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import type { LivePosition } from '../hooks/useOrderTracking';

const EDGE = { top: 110, bottom: 90, left: 70, right: 70 };

/**
 * Smoothly animates the partner marker between fixes (pings arrive every few seconds), so movement looks
 * continuous rather than jumping. The camera follows until the parent pans; the locate button resumes following.
 */
export function LiveMap({
  partner,
  destination,
  destinationLabel,
  destinationType,
  partnerLabel,
  recenterLabel,
  height = 300,
}: {
  partner: LivePosition | null;
  destination: { lat: number; lng: number };
  destinationLabel: string;
  destinationType: 'HOME' | 'SCHOOL';
  partnerLabel: string;
  recenterLabel: string;
  height?: number;
}) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);
  const [following, setFollowing] = useState(true);
  // Custom marker views must be rasterised once on Android before tracksViewChanges can be switched off.
  const [settled, setSettled] = useState(false);
  const style = useMemo(() => mapStyle(theme), [theme]);
  const animated = useRef(
    new AnimatedRegion({
      latitude: partner?.lat ?? destination.lat,
      longitude: partner?.lng ?? destination.lng,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;

  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 600);
    return () => clearTimeout(timer);
  }, []);

  const frame = (p: LivePosition | null) => {
    if (!p) return;
    mapRef.current?.fitToCoordinates(
      [
        { latitude: p.lat, longitude: p.lng },
        { latitude: destination.lat, longitude: destination.lng },
      ],
      { edgePadding: EDGE, animated: true },
    );
  };

  useEffect(() => {
    if (!partner) return;
    animated
      .timing({
        latitude: partner.lat,
        longitude: partner.lng,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: 2500,
        useNativeDriver: false,
        toValue: 0,
      } as never)
      .start();
    if (following) frame(partner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner, destination.lat, destination.lng, animated]);

  return (
    <View style={[styles.wrap, { height }]} accessible accessibilityLabel={`${partnerLabel}, ${destinationLabel}`}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        customMapStyle={style}
        initialRegion={{ latitude: destination.lat, longitude: destination.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        showsTraffic={false}
        showsPointsOfInterest={false}
        showsCompass={false}
        toolbarEnabled={false}
        onPanDrag={() => setFollowing(false)}
      >
        <Marker
          coordinate={{ latitude: destination.lat, longitude: destination.lng }}
          title={destinationLabel}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={!settled}
        >
          <View style={{ alignItems: 'center' }}>
            <View style={[styles.pin, { backgroundColor: theme.colors.accent, borderColor: theme.colors.surface }, elevation(theme, 2)]}>
              <Icon as={destinationType === 'HOME' ? House : School} size={18} color={theme.colors.onAccent} strokeWidth={2.2} />
            </View>
            <View style={[styles.pinTail, { borderTopColor: theme.colors.accent }]} />
          </View>
        </Marker>
        {partner ? (
          <Marker.Animated
            coordinate={animated as never}
            anchor={{ x: 0.5, y: 0.5 }}
            title={partnerLabel}
            tracksViewChanges={!settled}
          >
            <View style={styles.partnerWrap}>
              <View style={[styles.halo, { backgroundColor: theme.colors.primary }]} />
              <View style={[styles.partner, { backgroundColor: theme.colors.primary, borderColor: theme.colors.surface },
                elevation(theme, 2)]}>
                <Icon as={Bike} size={18} color={theme.colors.onPrimary} strokeWidth={2.2} />
              </View>
            </View>
          </Marker.Animated>
        ) : null}
      </MapView>
      {!following && partner ? (
        <View style={{ position: 'absolute', right: 14, bottom: 40 }}>
          <IconButton
            icon={LocateFixed}
            label={recenterLabel}
            tone="plain"
            onPress={() => {
              setFollowing(true);
              frame(partner);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  pin: { width: 38, height: 38, borderRadius: 19, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  pinTail: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  partnerWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 64, height: 64, borderRadius: 32, opacity: 0.16 },
  partner: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
});
