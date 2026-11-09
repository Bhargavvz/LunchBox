# Web stand-ins for native-only modules

The parent and partner apps ship to Android and iOS. For a quick look in a desktop browser (`expo start --web`),
Metro swaps these native-only modules for the files here. See `resolveRequest` in each app's `metro.config.js`.

| Module | Web behaviour |
|---|---|
| `@react-native-firebase/auth` | Firebase JS SDK, signing in through the local Auth emulator (`EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR`) |
| `@react-native-firebase/messaging` | No push on web; permission is reported as denied |
| `react-native-maps` | A placeholder panel instead of the map |
| `react-native-razorpay` | Checkout is unavailable; use `EXPO_PUBLIC_FAKE_PAYMENTS=true` |

Web is a preview surface for local development only. It is not a supported release target.
