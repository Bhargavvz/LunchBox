import type { TrackingMessage, TrackingSnapshot } from '@lunchbox/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, realtime } from '../lib/api';

export interface LivePosition {
  lat: number;
  lng: number;
  headingDeg: number | null;
  at: string;
}

const TRACKABLE = new Set(['PARTNER_EN_ROUTE', 'PICKED_UP', 'IN_TRANSIT', 'AT_SCHOOL']);
/** Without a live message for this long, the snapshot is polled quickly instead (socket dropped, app was asleep). */
const QUIET_MS = 30_000;
const FAST_POLL_MS = 10_000;
const SLOW_POLL_MS = 60_000;

/** True when `next` was recorded after `current` (or there is no current fix). */
export function isNewer(current: LivePosition | null, nextAt: string): boolean {
  return !current || Date.parse(nextAt) > Date.parse(current.at);
}

/**
 * REST snapshot for the initial state + STOMP updates on /topic/orders.{id}. Whichever source has the newest fix
 * wins, so a dropped socket never freezes the marker: while no live message arrives for 30 s the snapshot is polled
 * every 10 s. Status messages invalidate the order queries so the timeline refreshes.
 */
export function useOrderTracking(orderId: string) {
  const qc = useQueryClient();
  const lastLiveAt = useRef(0);
  const snapshot = useQuery<TrackingSnapshot>({
    queryKey: ['tracking', orderId],
    queryFn: () => api.orders.tracking(orderId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || !TRACKABLE.has(status)) return SLOW_POLL_MS;
      return Date.now() - lastLiveAt.current > QUIET_MS ? FAST_POLL_MS : SLOW_POLL_MS;
    },
  });
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  const accept = useCallback((next: LivePosition, eta: number | null | undefined) => {
    setPosition((cur) => (isNewer(cur, next.at) ? next : cur));
    if (eta !== undefined && eta !== null) setEtaSeconds(eta);
  }, []);

  useEffect(() => {
    const loc = snapshot.data?.location;
    if (loc) {
      accept({ lat: loc.lat, lng: loc.lng, headingDeg: loc.headingDeg, at: loc.recordedAt }, snapshot.data?.etaSeconds);
    } else if (snapshot.data?.etaSeconds !== undefined && snapshot.data.etaSeconds !== null) {
      setEtaSeconds(snapshot.data.etaSeconds);
    }
  }, [snapshot.data, accept]);

  useEffect(() => {
    if (!snapshot.data?.liveTrackingEnabled || snapshot.data.includedInPlan === false) return;
    return realtime.subscribeOrder(orderId, (m: TrackingMessage) => {
      lastLiveAt.current = Date.now();
      if (m.type === 'location' && m.lat !== null && m.lng !== null) {
        accept({ lat: m.lat, lng: m.lng, headingDeg: m.headingDeg, at: m.at }, m.etaSeconds);
      } else if (m.type === 'status') {
        void qc.invalidateQueries({ queryKey: ['tracking', orderId] });
        void qc.invalidateQueries({ queryKey: ['order', orderId] });
        void qc.invalidateQueries({ queryKey: ['orders', 'today'] });
      }
    });
  }, [orderId, snapshot.data?.liveTrackingEnabled, snapshot.data?.includedInPlan, qc, accept]);

  /** Minutes since the rider's last known position (null when unknown). */
  const ageMinutes = position ? Math.max(0, Math.floor((Date.now() - Date.parse(position.at)) / 60_000)) : null;
  return { snapshot, position, etaSeconds, ageMinutes };
}
