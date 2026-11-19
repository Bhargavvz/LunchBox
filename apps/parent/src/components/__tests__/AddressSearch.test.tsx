import * as Location from 'expo-location';
import { isPlusCode, searchPlaces } from '../AddressSearch';

jest.mock('expo-location', () => ({ geocodeAsync: jest.fn(), reverseGeocodeAsync: jest.fn() }));

const geocode = Location.geocodeAsync as jest.Mock;
const reverse = Location.reverseGeocodeAsync as jest.Mock;

describe('searchPlaces', () => {
  beforeEach(() => {
    geocode.mockReset();
    reverse.mockReset();
  });

  it('adds the city, keeps only places inside it and names each hit', async () => {
    geocode.mockResolvedValue([
      { latitude: 17.4156, longitude: 78.4347 }, // Banjara Hills
      { latitude: 12.97, longitude: 77.59 }, // Bengaluru: outside the service city
    ]);
    reverse.mockResolvedValue([{ name: 'Lotus Residency', street: 'Road No. 12', district: 'Banjara Hills', city: 'Hyderabad', postalCode: '500034' }]);

    const hits = await searchPlaces('Lotus Residency');

    expect(geocode).toHaveBeenCalledWith('Lotus Residency, Hyderabad');
    expect(hits).toEqual([
      { lat: 17.4156, lng: 78.4347, label: 'Lotus Residency, Road No. 12, Banjara Hills, Hyderabad, 500034' },
    ]);
  });

  it('does not add the city twice and shows each address once', async () => {
    geocode.mockResolvedValue([
      { latitude: 17.385, longitude: 78.4867 },
      { latitude: 17.38501, longitude: 78.48671 },
    ]);
    reverse.mockResolvedValue([{ name: 'Hussain Sagar', city: 'Hyderabad' }]);

    const hits = await searchPlaces('Hussain Sagar Hyderabad');

    expect(geocode).toHaveBeenCalledWith('Hussain Sagar Hyderabad');
    expect(hits).toHaveLength(1);
  });

  it('falls back to the typed text when a place has no address', async () => {
    geocode.mockResolvedValue([{ latitude: 17.4, longitude: 78.45 }]);
    reverse.mockRejectedValue(new Error('offline'));

    expect(await searchPlaces('Gachibowli')).toEqual([{ lat: 17.4, lng: 78.45, label: 'Gachibowli' }]);
  });

  it('drops Plus Codes from place names', async () => {
    expect(isPlusCode('CC8Q+QF3')).toBe(true);
    expect(isPlusCode('Lotus Residency')).toBe(false);
    geocode.mockResolvedValue([{ latitude: 17.4156, longitude: 78.4347 }]);
    reverse.mockResolvedValue([{ name: 'CC8Q+QF3', district: 'Banjara Hills', city: 'Hyderabad', postalCode: '500034' }]);

    expect(await searchPlaces('Banjara Hills')).toEqual([
      { lat: 17.4156, lng: 78.4347, label: 'Banjara Hills, Hyderabad, 500034' },
    ]);
  });
});
