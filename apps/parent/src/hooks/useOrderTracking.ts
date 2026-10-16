import type { TrackingMessage, TrackingSnapshot } from '@lunchbox/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, realtime } from '../lib/api';

export interface LivePosition {
  lat: number;
  lng: number;
  headingDeg: number | null;
  at: string;
}

/**
 * REST snapshot for the initial state + STOMP updates on /topic/orders.{id}. Status messages invalidate the
 * order queries so the timeline refreshes; location messages move the marker.
 */
export function useOrderTracking(orderId: string) {
  const qc = useQueryClient();
  const snapshot = useQuery<TrackingSnapshot>({
    queryKey: ['tracking', orderId],
    queryFn: () => api.orders.tracking(orderId),
    refetchInterval: 60_000,
  });
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  useEffect(() => {
    const loc = snapshot.data?.location;
    if (loc && !position) {
      setPosition({ lat: loc.lat, lng: loc.lng, headingDeg: loc.headingDeg, at: loc.recordedAt });
    }
    if (snapshot.data?.etaSeconds !== undefined && etaSeconds === null) {
      setEtaSeconds(snapshot.data.etaSeconds);
    }
  }, [snapshot.data, position, etaSeconds]);

  useEffect(() => {
    if (!snapshot.data?.liveTrackingEnabled) return;
    return realtime.subscribeOrder(orderId, (m: TrackingMessage) => {
      if (m.type === 'location' && m.lat !== null && m.lng !== null) {
        setPosition({ lat: m.lat, lng: m.lng, headingDeg: m.headingDeg, at: m.at });
        setEtaSeconds(m.etaSeconds);
      } else if (m.type === 'status') {
        void qc.invalidateQueries({ queryKey: ['tracking', orderId] });
        void qc.invalidateQueries({ queryKey: ['order', orderId] });
        void qc.invalidateQueries({ queryKey: ['orders', 'today'] });
      }
    });
  }, [orderId, snapshot.data?.liveTrackingEnabled, qc]);

  return { snapshot, position, etaSeconds };
}
