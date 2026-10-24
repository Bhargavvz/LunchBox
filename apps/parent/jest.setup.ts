/* Native modules are not available under Jest; provide minimal, explicit test doubles. */
jest.mock('@react-native-firebase/auth', () => {
  const auth = () => ({
    currentUser: null,
    onAuthStateChanged: () => () => undefined,
    signInWithPhoneNumber: jest.fn(),
    signOut: jest.fn(),
  });
  return { __esModule: true, default: auth };
});

jest.mock('@react-native-firebase/messaging', () => {
  const messaging = () => ({
    requestPermission: jest.fn().mockResolvedValue(1),
    getToken: jest.fn().mockResolvedValue('token'),
    onTokenRefresh: () => () => undefined,
    deleteToken: jest.fn(),
  });
  messaging.AuthorizationStatus = { AUTHORIZED: 1, PROVISIONAL: 2 };
  return { __esModule: true, default: messaging };
});

jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('react-native-razorpay', () => ({ open: jest.fn() }));
jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const MockMap = (props: object) => require('react').createElement(View, props);
  class AnimatedRegion {
    timing() {
      return { start: () => undefined };
    }
  }
  const Marker = MockMap as unknown as { Animated: unknown };
  Marker.Animated = MockMap;
  return { __esModule: true, default: MockMap, Marker, AnimatedRegion, PROVIDER_GOOGLE: 'google' };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
