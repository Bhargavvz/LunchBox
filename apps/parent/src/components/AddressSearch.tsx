import { SERVICE_CITY, SERVICE_CITY_BOUNDS } from '@lunchbox/api-client';
import { ListGroup, ListItem, Text, TextField } from '@lunchbox/ui';
import * as Location from 'expo-location';
import { MapPin, Search } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

export interface PlaceHit {
  lat: number;
  lng: number;
  label: string;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 450;
const MAX_HITS = 5;

function inCity(lat: number, lng: number): boolean {
  const b = SERVICE_CITY_BOUNDS;
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

/**
 * Finds a place by typing (area, street, apartment, landmark) with the phone's own geocoder, so no extra API key is
 * needed. Queries are debounced, biased to the service city, older answers never overwrite newer ones, and each hit is
 * labelled by reverse geocoding so the parent recognises it.
 */
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const q = query.trim();
  const withCity = q.toLowerCase().includes(SERVICE_CITY.toLowerCase()) ? q : `${q}, ${SERVICE_CITY}`;
  const coords = await Location.geocodeAsync(withCity);
  const near = coords.filter((c) => inCity(c.latitude, c.longitude)).slice(0, MAX_HITS);
  const hits = await Promise.all(near.map(async (c) => {
    const [a] = await Location.reverseGeocodeAsync({ latitude: c.latitude, longitude: c.longitude }).catch(() => []);
    const parts = a ? [a.name, [a.streetNumber, a.street].filter(Boolean).join(' '), a.district, a.city ?? a.subregion, a.postalCode] : [];
    const label = parts.filter((v, i, all): v is string => !!v && all.indexOf(v) === i).join(', ');
    return { lat: c.latitude, lng: c.longitude, label: label || q };
  }));
  // Different coordinates can resolve to the same address; show each address once.
  return hits.filter((h, i, all) => all.findIndex((o) => o.label === h.label) === i);
}

export function AddressSearch({ onPick, enabled }: { onPick: (hit: PlaceHit) => void; enabled: boolean }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'none' | 'error' | 'hits'; hits?: PlaceHit[] }>({ kind: 'idle' });
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setState({ kind: 'idle' });
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setState({ kind: 'busy' });
      try {
        const hits = await searchPlaces(q);
        if (mine !== seq.current) return;
        setState(hits.length ? { kind: 'hits', hits } : { kind: 'none' });
      } catch {
        if (mine === seq.current) setState({ kind: 'error' });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  if (!enabled) return null;
  return (
    <View style={{ gap: 8 }}>
      <TextField label={t('address.search')} icon={Search} placeholder={t('address.searchPlaceholder')} value={query}
                 onChangeText={setQuery} autoCorrect={false} returnKeyType="search" testID="address-search" />
      {state.kind === 'busy' ? <ActivityIndicator accessibilityLabel={t('address.searching')} /> : null}
      {state.kind === 'none' ? <Text variant="caption" muted>{t('address.noResults')}</Text> : null}
      {state.kind === 'error' ? <Text variant="caption" muted>{t('address.searchFailed')}</Text> : null}
      {state.kind === 'hits' && state.hits ? (
        <ListGroup>
          {state.hits.map((h) => (
            <ListItem key={`${h.lat},${h.lng}`} icon={MapPin} title={h.label.split(', ')[0]!}
                      subtitle={h.label.split(', ').slice(1).join(', ') || undefined} testID="address-hit"
                      onPress={() => {
                        onPick(h);
                        setQuery('');
                        setState({ kind: 'idle' });
                      }} />
          ))}
        </ListGroup>
      ) : null}
    </View>
  );
}
