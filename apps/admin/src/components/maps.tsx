'use client';

import { SERVICE_CITY_BOUNDS, SERVICE_CITY_CENTER, type GeoPoint } from '@lunchbox/api-client';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';
import { MapPinned } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';
export const DEFAULT_CENTER = { ...SERVICE_CITY_CENTER };
const INK = '#1D4F47';

/** Quiet steel-and-chalk basemap so partner pins and fences are the loudest thing on it (same intent as the mobile mapStyle). */
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#eef2f0' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#56625d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f3f5f4' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#dcebdd' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dcebe6' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#b9d3ca' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfe1e8' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c2cbc7' }] },
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
                icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: INK, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 }} />
      ))}
    </>
  );
}

/**
 * Polygon drawing without the deprecated Drawing Library: click to add vertices, drag vertices to adjust.
 *
 * The polygon owns one MVCArray path for its whole life. A polygon created with an empty `paths` has no path at all
 * (getPath() is undefined), which crashed the "new service area" form; and replacing the path on prop changes would
 * detach the edit listeners. Incoming values are therefore copied into the same array.
 */
export function PolygonEditor({ value, onChange, readOnly }: { value: GeoPoint[]; onChange?: (v: GeoPoint[]) => void; readOnly?: boolean }) {
  const map = useMap();
  const pathRef = useRef<google.maps.MVCArray<google.maps.LatLng> | null>(null);
  const syncing = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!map) return;
    const path = new google.maps.MVCArray(value.map((v) => new google.maps.LatLng(v.lat, v.lng)));
    pathRef.current = path;
    const poly = new google.maps.Polygon({
      map,
      paths: [path],
      editable: !readOnly,
      strokeColor: INK,
      strokeWeight: 2,
      fillColor: INK,
      fillOpacity: 0.15,
    });
    const emit = () => {
      if (syncing.current) return;
      onChangeRef.current?.(path.getArray().map((ll) => ({ lat: ll.lat(), lng: ll.lng() })));
    };
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
      pathRef.current = null;
    };
    // Re-create only when the map or edit mode changes; vertex edits flow through listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, readOnly]);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const current = path.getArray();
    const same = current.length === value.length && current.every((ll, i) => ll.lat() === value[i]!.lat && ll.lng() === value[i]!.lng);
    if (same) return;
    // Copy into the existing array (keeps the listeners) without echoing each step back to onChange.
    syncing.current = true;
    path.clear();
    value.forEach((v) => path.push(new google.maps.LatLng(v.lat, v.lng)));
    syncing.current = false;
  }, [value]);

  return null;
}

/**
 * Choose one place on the map: click or drag the pin, or search an address. Shows the place as a readable address
 * (reverse geocoding); coordinates stay internal. Search needs the Geocoding API on the web key; without it the pin
 * still works and the search explains why it cannot look addresses up.
 */
export function PinPicker({ value, onChange, label, height = 300 }: {
  value: GeoPoint;
  onChange: (v: GeoPoint) => void;
  label: string;
  height?: number;
}) {
  const [query, setQuery] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [panTo, setPanTo] = useState<GeoPoint | null>(null);

  const search = async () => {
    if (!query.trim() || typeof google === 'undefined') return;
    setNote(null);
    try {
      const { results } = await new google.maps.Geocoder().geocode({ address: query, region: 'IN', bounds: SERVICE_CITY_BOUNDS });
      const hit = results[0];
      if (!hit) return setNote('No place found for that address.');
      const point = { lat: hit.geometry.location.lat(), lng: hit.geometry.location.lng() };
      onChange(point);
      setPanTo(point);
    } catch {
      setNote('Address search is unavailable (enable the Geocoding API for the web key). Click the map to place the pin.');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input aria-label={`Search ${label.toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }}
               placeholder="Search an address or landmark"
               className="h-9 flex-1 rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="button" onClick={() => void search()}
                className="h-9 rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted">Find</button>
      </div>
      <MapFrame label={label} height={height} center={value} zoom={15}>
        <PinLayer value={value} onChange={onChange} onAddress={setAddress} panTo={panTo} />
      </MapFrame>
      <p className="text-sm" aria-live="polite">
        {note ? <span className="text-destructive">{note}</span>
          : <span className="text-muted-foreground">{address ?? 'Click the map or drag the pin to the exact entrance.'}</span>}
      </p>
    </div>
  );
}

function PinLayer({ value, onChange, onAddress, panTo }: {
  value: GeoPoint;
  onChange: (v: GeoPoint) => void;
  onAddress: (a: string | null) => void;
  panTo: GeoPoint | null;
}) {
  const map = useMap();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!map) return;
    const l = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) onChangeRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    return () => l.remove();
  }, [map]);
  useEffect(() => {
    if (map && panTo) map.panTo(panTo);
  }, [map, panTo]);
  useEffect(() => {
    if (typeof google === 'undefined') return;
    let live = true;
    // Debounced so dragging the pin does not fire a lookup per frame.
    const timer = setTimeout(() => {
      new google.maps.Geocoder().geocode({ location: { lat: value.lat, lng: value.lng } })
        .then(({ results }) => { if (live) onAddress(results[0]?.formatted_address ?? null); })
        .catch(() => { if (live) onAddress(null); });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [value.lat, value.lng, onAddress]);
  return (
    <Marker position={value} draggable title="Drag to adjust"
            onDragEnd={(e) => { if (e.latLng) onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() }); }} />
  );
}
