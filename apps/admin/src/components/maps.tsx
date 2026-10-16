'use client';

import type { GeoPoint } from '@lunchbox/api-client';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';
import { useEffect, useRef, type ReactNode } from 'react';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';
export const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 };

export function MapFrame({ children, height = 420, center = DEFAULT_CENTER, zoom = 12, label }: {
  children?: ReactNode;
  height?: number;
  center?: { lat: number; lng: number };
  zoom?: number;
  label: string;
}) {
  if (!KEY) {
    return (
      <div role="note" className="flex items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground" style={{ height }}>
        Set NEXT_PUBLIC_GOOGLE_MAPS_KEY to show the map.
      </div>
    );
  }
  return (
    <APIProvider apiKey={KEY}>
      <div role="region" aria-label={label} className="overflow-hidden rounded-lg border" style={{ height }}>
        <Map defaultCenter={center} defaultZoom={zoom} gestureHandling="greedy" disableDefaultUI={false}>
          {children}
        </Map>
      </div>
    </APIProvider>
  );
}

export function PartnerMarkers({ partners }: { partners: { partnerId: string; lat: number; lng: number; label: string }[] }) {
  return (
    <>
      {partners.map((p) => (
        <Marker key={p.partnerId} position={{ lat: p.lat, lng: p.lng }} title={p.label} />
      ))}
    </>
  );
}

/** Polygon drawing without the deprecated Drawing Library: click to add vertices, drag vertices to adjust. */
export function PolygonEditor({ value, onChange, readOnly }: { value: GeoPoint[]; onChange?: (v: GeoPoint[]) => void; readOnly?: boolean }) {
  const map = useMap();
  const polygon = useRef<google.maps.Polygon | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!map) return;
    const poly = new google.maps.Polygon({
      map,
      paths: value.map((v) => ({ lat: v.lat, lng: v.lng })),
      editable: !readOnly,
      strokeColor: '#14875A',
      fillColor: '#14875A',
      fillOpacity: 0.15,
    });
    polygon.current = poly;
    const emit = () =>
      onChangeRef.current?.(poly.getPath().getArray().map((ll) => ({ lat: ll.lat(), lng: ll.lng() })));
    const path = poly.getPath();
    const listeners = [
      path.addListener('set_at', emit),
      path.addListener('insert_at', emit),
      path.addListener('remove_at', emit),
    ];
    const click = readOnly
      ? null
      : map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) path.push(e.latLng);
        });
    return () => {
      listeners.forEach((l) => l.remove());
      click?.remove();
      poly.setMap(null);
    };
    // Re-create only when the map or edit mode changes; vertex edits flow through listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, readOnly]);

  useEffect(() => {
    const poly = polygon.current;
    if (!poly) return;
    const current = poly.getPath().getArray();
    const same = current.length === value.length && current.every((ll, i) => ll.lat() === value[i]!.lat && ll.lng() === value[i]!.lng);
    if (!same) poly.setPath(value.map((v) => ({ lat: v.lat, lng: v.lng })));
  }, [value]);

  return null;
}
