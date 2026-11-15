import type { StopView } from '@lunchbox/api-client';
import { Icon, IconButton, Text, mapStyle, useTheme } from '@lunchbox/ui';
import { Check, LocateFixed, School, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

const DONE = new Set<StopView['status']>(['COMPLETED', 'SKIPPED', 'FAILED']);
const EDGE = { top: 60, bottom: 60, left: 50, right: 50 };

/**
 * Today's route on a map: numbered pickups, the school drop, the rider's own position (blue dot) and the planned
 * order as a line through the stops still to do. Tapping a stop opens it. The line joins stops in sequence; the
 * road route itself comes from Google Maps navigation.
 */
export function RouteMap({
  stops,
  activeStopId,
  onSelectStop,
  recenterLabel,
  accessibilityLabel,
  height = 260,
}: {
  stops: StopView[];
  activeStopId?: string;
  onSelectStop: (stop: StopView) => void;
  recenterLabel: string;
  accessibilityLabel: string;
  height?: number;
}) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);
  const [settled, setSettled] = useState(false);
  const style = useMemo(() => mapStyle(theme), [theme]);

  const remaining = stops.filter((s) => !DONE.has(s.status));
  const coords = (list: StopView[]) => list.map((s) => ({ latitude: s.location.lat, longitude: s.location.lng }));
  const fit = () => {
    const points = coords(remaining.length > 0 ? remaining : stops);
    if (points.length > 0) mapRef.current?.fitToCoordinates(points, { edgePadding: EDGE, animated: true });
  };

  // Custom marker views are rasterised on Android; let icons draw before freezing them, and redraw the bitmaps 
  // whenever a stop changes state (done, failed, now active).
  const statusKey = stops.map((s) => s.status).join() + (activeStopId ?? '');
  useEffect(() => {
    setSettled(false);
    const timer = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(timer);
  }, [statusKey]);

  if (stops.length === 0) return null;
  const first = stops[0]!;

  return (
    <View style={[styles.wrap, { height, borderRadius: theme.radius.lg }]} accessible accessibilityLabel={accessibilityLabel}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        customMapStyle={style}
        initialRegion={{ latitude: first.location.lat, longitude: first.location.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        onMapReady={fit}
        showsUserLocation
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {remaining.length > 1 ? (
          <Polyline
            coordinates={coords(remaining)}
            strokeColor={theme.colors.primary}
            strokeWidth={4}
            lineDashPattern={[12, 8]}
          />
        ) : null}
        {stops.map((s) => {
          const done = DONE.has(s.status);
          const active = s.stopId === activeStopId;
          const bg = done
            ? theme.colors.sunken
            : s.type === 'DROP'
              ? theme.colors.info
              : active
                ? theme.colors.accent
                : theme.colors.primary;
          const fg = done ? theme.colors.textMuted : s.type === 'DROP' ? theme.colors.surface : active ? theme.colors.onAccent : theme.colors.onPrimary;
          return (
            <Marker
              key={s.stopId}
              coordinate={{ latitude: s.location.lat, longitude: s.location.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={active ? 10 : done ? 0 : 5}
              tracksViewChanges={!settled}
              onPress={() => onSelectStop(s)}
              accessibilityLabel={`${s.sequence}`}
            >
              {/* No elevation inside markers: Android snapshots of shadowed views come out blank. */}
              <View style={[styles.pin, active && styles.pinActive, { backgroundColor: bg, borderColor: theme.colors.surface }]}>
                {s.status === 'FAILED' ? (
                  <Icon as={X} size={14} color={fg} strokeWidth={3} />
                ) : done ? (
                  <Icon as={Check} size={14} color={fg} strokeWidth={3} />
                ) : s.type === 'DROP' ? (
                  <Icon as={School} size={15} color={fg} strokeWidth={2.4} />
                ) : (
                  <Text variant="label" style={{ color: fg, fontSize: 13 }}>
                    {s.sequence}
                  </Text>
                )}
              </View>
            </Marker>
          );
        })}
      </MapView>
      <View style={{ position: 'absolute', right: 10, bottom: 10 }}>
        <IconButton icon={LocateFixed} label={recenterLabel} tone="plain" onPress={fit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  pin: { width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  pinActive: { width: 38, height: 38, borderRadius: 19, borderWidth: 3 },
});
