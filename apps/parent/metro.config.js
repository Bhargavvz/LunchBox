// Monorepo-aware Metro config: watch the workspace packages and resolve hoisted node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
// Watch only what the app imports from outside its folder. Watching the whole repo (backend build output, the
// admin's .next, Gradle caches) makes Metro's file watcher time out on Windows.
config.watchFolders = [path.resolve(workspaceRoot, 'node_modules'), path.resolve(workspaceRoot, 'packages')];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// Browser preview only: native-only modules are swapped for the stand-ins in packages/web-shims.
const shims = path.resolve(workspaceRoot, 'packages/web-shims');
const webShims = {
  '@react-native-firebase/auth': 'firebase-auth.js',
  '@react-native-firebase/messaging': 'firebase-messaging.js',
  'react-native-maps': 'react-native-maps.js',
  'react-native-razorpay': 'react-native-razorpay.js',
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && webShims[moduleName]) {
    return { type: 'sourceFile', filePath: path.join(shims, webShims[moduleName]) };
  }
  // zustand's ESM build reads import.meta, which the classic web bundle cannot parse; use its CommonJS build.
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    const entry = moduleName === 'zustand' ? 'index' : moduleName.slice('zustand/'.length);
    return { type: 'sourceFile', filePath: path.resolve(workspaceRoot, 'node_modules/zustand', entry + '.js') };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
