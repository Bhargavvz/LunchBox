import { Linking } from 'react-native';
import { navigateRoute } from '../navigation';

describe('navigateRoute', () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);

  beforeEach(() => open.mockClear());

  it('sends the stops in order as waypoints, ending at the last one', async () => {
    await navigateRoute([
      { lat: 17.1, lng: 78.1 },
      { lat: 17.2, lng: 78.2 },
      { lat: 17.3, lng: 78.3 },
    ]);
    const url = open.mock.calls[0]![0];
    expect(url).toContain('destination=17.3,78.3');
    expect(decodeURIComponent(url)).toContain('waypoints=17.1,78.1|17.2,78.2');
    expect(url).toContain('travelmode=driving');
  });

  it('passes at most 9 waypoints plus the destination', async () => {
    const points = Array.from({ length: 14 }, (_, i) => ({ lat: 17 + i / 100, lng: 78 }));
    await navigateRoute(points);
    const url = decodeURIComponent(open.mock.calls[0]![0]);
    expect(url).toContain('destination=17.09,78');
    expect(url.split('waypoints=')[1]!.split('&')[0]!.split('|')).toHaveLength(9);
  });

  it('does nothing without stops', async () => {
    await navigateRoute([]);
    expect(open).not.toHaveBeenCalled();
  });
});
