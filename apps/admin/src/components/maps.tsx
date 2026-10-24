'use client';

import type { GeoPoint } from '@lunchbox/api-client';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';
import { MapPinned } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';
export const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 };
const LEAF = '#1E5A43';

/** Quiet, paper-toned basemap so partner pins and fences are the loudest thing on it (same intent as the mobile mapStyle). */
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f4efe6' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b6359' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#fbf8f2' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#dfe8d6' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#fbf6ec' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f1dfb8' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e3c88f' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfdde3' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#d8cfc0' }] },
];

export function MapFrame({ children, height = 420, center = DEFAULT_CENTER, zoom = 12, label }: {
  children?: ReactNode;
  height?: number;
  center?: { lat: number; lng: number };
  zoom?: number;
  label: string;
}) {
  if (!KEY) {
    return (
      <div role="note" className="paper-grain flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/60 px-6 text-center text-sm text-muted-foreground" style={{ height }}>
        <MapPinned className="h-6 w-6 opacity-70" aria-hidden />
        <span>Set <code className="rounded bg-card px-1 py-0.5 text-[12px]">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> to show the map.</span>
      </div>
    );
  }
  return (
    <APIProvider apiKey={KEY}>
      <div role="region" aria-label={label} className="overflow-hidden rounded-xl border" style={{ height }}>
        <Map defaultCenter={center} defaultZoom={zoom} gestureHandling="greedy" disableDefaultUI
             zoomControl fullscreenControl styles={MAP_STYLES} clickableIcons={false}>
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
        <Marker key={p.partnerId} position={{ lat: p.lat, lng: p.lng }} title={p.label}
                icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: LEAF, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 }} />
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
      strokeColor: LEAF,
      strokeWeight: 2,
      fillColor: LEAF,
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
