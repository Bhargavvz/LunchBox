// Web stand-in for react-native-maps: a labelled panel where the map would be. Markers and overlays render nothing.
import { forwardRef, useImperativeHandle } from 'react';
import { Text, View } from 'react-native';

const MapView = forwardRef(function MapView({ style }, ref) {
  useImperativeHandle(ref, () => ({
    animateToRegion() {},
    animateCamera() {},
    fitToCoordinates() {},
  }));
  return (
    <View style={[{ backgroundColor: '#E8E2D6', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#6B6255', fontSize: 13 }}>Map preview is available in the phone app</Text>
    </View>
  );
});

function Nothing() {
  return null;
}

export const Marker = Object.assign(Nothing, { Animated: Nothing });
export const Polyline = Nothing;
export const Polygon = Nothing;
export const Circle = Nothing;
export const Callout = Nothing;
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = undefined;

export class AnimatedRegion {
  constructor(region) {
    Object.assign(this, region);
  }
  timing() {
    return { start: (done) => done?.({ finished: true }) };
  }
  spring() {
    return this.timing();
  }
  stopAnimation() {}
  setValue() {}
}

export default MapView;
