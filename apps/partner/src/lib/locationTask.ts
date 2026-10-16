import type { PingInput } from '@lunchbox/api-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api, realtime } from './api';
import { shouldSend, type Fix } from './throttle';

export const LOCATION_TASK = 'lunchbox-route-location';
const PENDING_KEY = 'lunchbox.pendingPings';
const MAX_PENDING = 500;

let lastSent: Fix | null = null;

async function flushPending(extra: PingInput[]): Promise<void> {
  const stored = await AsyncStorage.getItem(PENDING_KEY);
  const pending: PingInput[] = stored ? (JSON.parse(stored) as PingInput[]) : [];
  const all = [...pending, ...extra].slice(-MAX_PENDING);
  if (all.length === 0) return;
  try {
    for (let i = 0; i < all.length; i += 200) {
      await api.partner.sendLocations(all.slice(i, i + 200));
    }
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    // Offline: keep the most recent fixes and retry on the next callback.
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(all));
  }
}

/**
 * Background task: runs while the route is active (OS foreground service on Android). Applies adaptive throttling,
 * sends over the open STOMP socket when possible, otherwise batches over HTTP; fixes taken offline are queued.
 */
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const toSend: PingInput[] = [];
  for (const loc of locations) {
    const fix: Fix = { lat: loc.coords.latitude, lng: loc.coords.longitude, speedMps: loc.coords.speed, at: loc.timestamp };
    if (!shouldSend(lastSent, fix)) continue;
    lastSent = fix;
    toSend.push({
      lat: fix.lat,
      lng: fix.lng,
      accuracyM: loc.coords.accuracy ?? undefined,
      speedMps: loc.coords.speed !== null && loc.coords.speed >= 0 ? loc.coords.speed : undefined,
      headingDeg: loc.coords.heading !== null && loc.coords.heading >= 0 ? loc.coords.heading : undefined,
      recordedAt: new Date(loc.timestamp).toISOString(),
    });
  }
  if (toSend.length === 0) return;
  const viaSocket = toSend.length === 1 && realtime.sendLocation(toSend[0]!);
  if (!viaSocket) {
    await flushPending(toSend);
  }
});

export async function startRouteTracking(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return false;
  lastSent = null;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return true;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5_000,
    distanceInterval: 10,
    deferredUpdatesInterval: 5_000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'LunchBox route active',
      notificationBody: 'Sharing your location with parents while you deliver.',
      killServiceOnDestroy: false,
    },
  });
  return true;
}

export async function stopRouteTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  await flushPending([]);
  lastSent = null;
}

export async function currentPosition(): Promise<{ lat: number; lng: number }> {
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
