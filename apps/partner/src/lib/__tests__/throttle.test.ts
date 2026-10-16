import { distanceMeters, shouldSend, THROTTLE, type Fix } from '../throttle';

const base: Fix = { lat: 12.9716, lng: 77.5946, speedMps: 5, at: 1_000_000 };

function moved(meters: number, ms: number, speed = 5): Fix {
  // ~111,320 m per degree of latitude
  return { lat: base.lat + meters / 111_320, lng: base.lng, speedMps: speed, at: base.at + ms };
}

describe('adaptive throttle', () => {
  it('always sends the first fix', () => {
    expect(shouldSend(null, base)).toBe(true);
  });

  it('sends while moving once time and distance thresholds pass', () => {
    expect(shouldSend(base, moved(30, THROTTLE.movingMinIntervalMs))).toBe(true);
  });

  it('holds back fixes that are too soon', () => {
    expect(shouldSend(base, moved(100, 1_000))).toBe(false);
  });

  it('drops to a slow heartbeat when stationary', () => {
    expect(shouldSend(base, moved(3, 20_000, 0))).toBe(false);
    expect(shouldSend(base, moved(3, THROTTLE.stationaryIntervalMs, 0))).toBe(true);
  });

  it('ignores out-of-order fixes', () => {
    expect(shouldSend(base, { ...base, at: base.at - 1 })).toBe(false);
  });

  it('computes distances', () => {
    expect(distanceMeters(base, moved(1000, 0))).toBeCloseTo(1000, -1);
  });
});
