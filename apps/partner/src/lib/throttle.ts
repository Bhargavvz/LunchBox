/**
 * Adaptive location throttling. A fix is sent when BOTH enough time has passed AND (enough distance was covered OR
 * a heartbeat interval elapsed). Moving partners report every ~5 s / 25 m; stationary partners (waiting at a
 * door or the school gate) drop to a 60 s heartbeat to save battery and data.
 */
export interface Fix {
  lat: number;
  lng: number;
  speedMps: number | null;
  at: number; // epoch ms
}

export const THROTTLE = {
  movingMinIntervalMs: 5_000,
  movingMinDistanceM: 25,
  stationarySpeedMps: 0.7,
  stationaryIntervalMs: 60_000,
} as const;

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function shouldSend(lastSent: Fix | null, next: Fix): boolean {
  if (!lastSent) return true;
  const elapsed = next.at - lastSent.at;
  if (elapsed <= 0) return false;
  const moved = distanceMeters(lastSent, next);
  const stationary = (next.speedMps ?? 0) < THROTTLE.stationarySpeedMps && moved < THROTTLE.movingMinDistanceM;
  if (stationary) {
    return elapsed >= THROTTLE.stationaryIntervalMs;
  }
  return elapsed >= THROTTLE.movingMinIntervalMs && (moved >= THROTTLE.movingMinDistanceM || elapsed >= THROTTLE.stationaryIntervalMs);
}
