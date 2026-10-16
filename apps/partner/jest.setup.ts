jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => undefined }));
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => ({ currentUser: null, onAuthStateChanged: () => () => undefined, signOut: jest.fn() }),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
