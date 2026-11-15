import { Icon, IconButton, mapStyle, useTheme } from '@lunchbox/ui';
import { Bike, House, LocateFixed, School } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import type { LivePosition } from '../hooks/useOrderTracking';

const EDGE = { top: 110, bottom: 90, left: 70, right: 70 };
const GLIDE_MS = 2500;
const FRAME_MS = 50;

/**
 * Smoothly moves the partner marker between fixes (pings arrive every few seconds), so movement looks continuous
 * rather than jumping. The camera follows until the parent pans; the locate button resumes following.
 *
 * The glide is interpolated here and fed to a plain Marker: react-native-maps' Marker.Animated clips custom marker
 * views on Android with the New Architecture (only a quarter of the scooter showed).
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
  const [shown, setShown] = useState<{ lat: number; lng: number } | null>(partner);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  // Android snapshots custom marker views. Freeze them only once the map is ready and the icons have drawn, and
  // redraw when the partner first appears; freezing earlier leaves blank markers (only the pin tail shows).
  const [mapReady, setMapReady] = useState(false);
  const hasPartner = partner !== null;
  useEffect(() => {
    if (!mapReady) return;
    setSettled(false);
    const timer = setTimeout(() => setSettled(true), 2000);
    return () => clearTimeout(timer);
  }, [mapReady, hasPartner]);

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
    if (following) frame(partner);
    const from = shownRef.current;
    if (!from) {
      setShown({ lat: partner.lat, lng: partner.lng });
      return;
    }
    // Ease-out glide from where the marker is now to the new fix.
    const started = Date.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / GLIDE_MS);
      const k = 1 - (1 - t) * (1 - t);
      setShown({ lat: from.lat + (partner.lat - from.lat) * k, lng: from.lng + (partner.lng - from.lng) * k });
      if (t >= 1) clearInterval(timer);
    }, FRAME_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner, destination.lat, destination.lng]);

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
        onMapReady={() => setMapReady(true)}
      >
        <Marker
          coordinate={{ latitude: destination.lat, longitude: destination.lng }}
          title={destinationLabel}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={!settled}
        >
          <View style={{ alignItems: 'center' }}>
            {/* No elevation inside markers: Android renders shadowed views in marker snapshots as blank. */}
            <View style={[styles.pin, { backgroundColor: theme.colors.accent, borderColor: theme.colors.surface }]}>
              <Icon as={destinationType === 'HOME' ? House : School} size={18} color={theme.colors.onAccent} strokeWidth={2.2} />
            </View>
            <View style={[styles.pinTail, { borderTopColor: theme.colors.accent }]} />
          </View>
        </Marker>
        {shown ? (
          <Marker
            coordinate={{ latitude: shown.lat, longitude: shown.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            title={partnerLabel}
            tracksViewChanges={!settled}
          >
            {/* The halo is the container (no absolute layers): Android clips absolutely positioned children out of
                marker snapshots, which left only a quarter of the scooter visible. */}
            <View collapsable={false} style={[styles.halo, { backgroundColor: theme.colors.primarySoft }]}>
              <View style={[styles.partner, { backgroundColor: theme.colors.primary, borderColor: theme.colors.surface }]}>
                <Icon as={Bike} size={16} color={theme.colors.onPrimary} strokeWidth={2.2} />
              </View>
            </View>
          </Marker>
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
  // Kept small: Android cuts larger custom marker bitmaps (a 60 dp marker showed only its top-left quarter).
  halo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  partner: { width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
