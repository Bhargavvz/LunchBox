import type { Theme } from './tokens';

/** Google Maps style rules (the `customMapStyle` shape), kept as plain data so this package needs no maps dependency. */
export type MapStyleRule = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
};

/**
 * A quiet, warm basemap that matches the paper palette: businesses and transit hidden, parks and schools tinted,
 * so the partner marker and the destination are the only saturated things on screen.
 */
export function mapStyle(theme: Theme): MapStyleRule[] {
  const p = theme.dark
    ? { land: '#1E1C19', text: '#9C948A', halo: '#141311', road: '#2A2723', arterial: '#302C27', highway: '#3D3529',
        highwayEdge: '#4A4031', water: '#16252A', park: '#1F2A21', school: '#2E2819' }
    : { land: '#F3EEE4', text: '#6B635A', halo: '#F6F2EA', road: '#FFFDF8', arterial: '#FFFFFF', highway: '#F2DFB3',
        highwayEdge: '#E2C98E', water: '#C9DCE0', park: '#DCE8D6', school: '#F1E3C4' };
  return [
    { elementType: 'geometry', stylers: [{ color: p.land }] },
    { elementType: 'labels.text.fill', stylers: [{ color: p.text }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: p.halo }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: p.park }] },
    { featureType: 'poi.school', elementType: 'geometry', stylers: [{ color: p.school }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: p.road }] },
    { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: p.arterial }] },
    { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: p.highway }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: p.highwayEdge }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: p.water }] },
  ];
}
