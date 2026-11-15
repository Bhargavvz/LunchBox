import { Linking, Platform } from 'react-native';

/** Opens turn-by-turn navigation in Google Maps (falls back to Apple Maps / browser). */
export async function navigateTo(lat: number, lng: number): Promise<void> {
  const google = `google.navigation:q=${lat},${lng}&mode=d`;
  const universal = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  if (Platform.OS === 'android' && (await Linking.canOpenURL(google))) {
    await Linking.openURL(google);
    return;
  }
  const comgooglemaps = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
  if (Platform.OS === 'ios' && (await Linking.canOpenURL(comgooglemaps))) {
    await Linking.openURL(comgooglemaps);
    return;
  }
  await Linking.openURL(universal);
}

/**
 * Turn-by-turn navigation through several stops in order (Google Maps directions with waypoints). Google Maps takes
 * at most 9 waypoints plus the destination, so only the next 10 stops are passed; the rest follow after re-opening.
 */
export async function navigateRoute(points: { lat: number; lng: number }[]): Promise<void> {
  const next = points.slice(0, 10);
  if (next.length === 0) return;
  if (next.length === 1) {
    await navigateTo(next[0]!.lat, next[0]!.lng);
    return;
  }
  const destination = next[next.length - 1]!;
  const waypoints = next
    .slice(0, -1)
    .map((p) => `${p.lat},${p.lng}`)
    .join('|');
  await Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}` +
      `&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving&dir_action=navigate`,
  );
}
