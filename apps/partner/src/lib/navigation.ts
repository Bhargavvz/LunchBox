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
