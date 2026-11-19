import type { Theme } from './tokens';

/** Google Maps style rules (the `customMapStyle` shape), kept as plain data so this package needs no maps dependency. */
export type MapStyleRule = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
};

/**
 * A quiet, cool basemap that matches the notebook-paper palette: businesses and transit hidden, parks and schools tinted
 * (schools in pale turmeric), so the partner marker and the destination are the only saturated things on screen.
 */
export function mapStyle(theme: Theme): MapStyleRule[] {
  const p = theme.dark
    ? { land: '#121A17', text: '#8FA39B', halo: '#0E1513', road: '#1C2622', arterial: '#22302B', highway: '#2A3B35',
        highwayEdge: '#35493F', water: '#0F2229', park: '#14281D', school: '#33270F' }
    : { land: '#EEF2F0', text: '#56625D', halo: '#F3F5F4', road: '#FFFFFF', arterial: '#FFFFFF', highway: '#DCEBE6',
        highwayEdge: '#B9D3CA', water: '#CFE1E8', park: '#DCEBDD', school: '#FDF0D8' };
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
