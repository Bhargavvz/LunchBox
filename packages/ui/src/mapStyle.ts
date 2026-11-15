import type { Theme } from './tokens';

/** Google Maps style rules (the `customMapStyle` shape), kept as plain data so this package needs no maps dependency. */
export type MapStyleRule = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
};

/**
 * A quiet, cool basemap that matches the notebook-paper palette: businesses and transit hidden, parks and schools tinted
 * (schools in pale mango), so the partner marker and the destination are the only saturated things on screen.
 */
export function mapStyle(theme: Theme): MapStyleRule[] {
  const p = theme.dark
    ? { land: '#141B2B', text: '#8C96AE', halo: '#0D1220', road: '#20293D', arterial: '#263049', highway: '#2F3A57',
        highwayEdge: '#3A4668', water: '#0E2233', park: '#15281F', school: '#2F2814' }
    : { land: '#EEF1F5', text: '#5A6478', halo: '#F1F3F6', road: '#FFFFFF', arterial: '#FFFFFF', highway: '#DCE3F7',
        highwayEdge: '#C4CEEE', water: '#CBDDEB', park: '#DCEBDD', school: '#FBEACB' };
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
