import { useTheme } from '@lunchbox/ui';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import type { LivePosition } from '../hooks/useOrderTracking';

/**
 * Smoothly animates the partner marker between fixes (pings arrive every few seconds), so movement looks
 * continuous rather than jumping.
 */
export function LiveMap({
  partner,
  destination,
  destinationLabel,
}: {
  partner: LivePosition | null;
  destination: { lat: number; lng: number };
  destinationLabel: string;
}) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);
  const animated = useRef(
    new AnimatedRegion({
      latitude: partner?.lat ?? destination.lat,
      longitude: partner?.lng ?? destination.lng,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;

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
    mapRef.current?.fitToCoordinates(
      [
        { latitude: partner.lat, longitude: partner.lng },
        { latitude: destination.lat, longitude: destination.lng },
      ],
      { edgePadding: { top: 60, bottom: 60, left: 60, right: 60 }, animated: true },
    );
  }, [partner, destination.lat, destination.lng, animated]);

  return (
    <View style={styles.wrap} accessible accessibilityLabel="Map showing your delivery partner and destination">
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: destination.lat, longitude: destination.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        showsTraffic={false}
        toolbarEnabled={false}
      >
        <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title={destinationLabel}
                pinColor={theme.colors.accent} />
        {partner ? (
          <Marker.Animated
            coordinate={animated as never}
            flat
            rotation={partner.headingDeg ?? 0}
            anchor={{ x: 0.5, y: 0.5 }}
            pinColor={theme.colors.primary}
            title="Partner"
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 300, borderRadius: 16, overflow: 'hidden' },
});
