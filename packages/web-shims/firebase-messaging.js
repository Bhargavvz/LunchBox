// Web stand-in for @react-native-firebase/messaging: no push on web, so permission is always denied.
const noop = () => () => undefined;

export default function messaging() {
  return {
    requestPermission: async () => messaging.AuthorizationStatus.DENIED,
    hasPermission: async () => messaging.AuthorizationStatus.DENIED,
    registerDeviceForRemoteMessages: async () => undefined,
    getToken: async () => '',
    deleteToken: async () => undefined,
    onTokenRefresh: noop,
    onMessage: noop,
    onNotificationOpenedApp: noop,
    getInitialNotification: async () => null,
    setBackgroundMessageHandler: () => undefined,
  };
}

messaging.AuthorizationStatus = { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 };
