const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

// iOS 27 stops at launch any app built with the iOS 27 SDK that has not adopted the scene
// life cycle (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`, seen on an
// iPhone running 27.0.1). Expo 57's prebuild template still creates the window in the app
// delegate, so this plugin switches to Expo's own `ExpoAppSceneDelegate`:
// - Info.plist declares one window scene whose delegate is `EXExpoAppSceneDelegate`.
// - The app delegate keeps creating the React Native factory, adopts
//   `ExpoReactNativeFactoryProvider`, and stops creating a window; the scene delegate makes the
//   window and starts React Native in it, and forwards URLs (the Shortcuts `raveguard://`
//   callback) to the app delegate as before.
// Scenes exist since iOS 13, so this builds the same with Xcode 26 and 27.

const SCENE_DELEGATE = 'EXExpoAppSceneDelegate';
const PROVIDER = 'ExpoReactNativeFactoryProvider';
const WINDOW_START = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: SCENE_DELEGATE },
    ],
  },
};

function addSceneManifest(infoPlist) {
  return { ...infoPlist, UIApplicationSceneManifest: SCENE_MANIFEST };
}

/** Lets the scene delegate start React Native: the app delegate only builds the factory. */
function adoptSceneDelegate(contents) {
  if (contents.includes(`ExpoAppDelegate, ${PROVIDER}`)) return contents;
  const declaration = 'class AppDelegate: ExpoAppDelegate {';
  if (!contents.includes(declaration) || !WINDOW_START.test(contents)) {
    throw new Error('Cannot adopt the iOS scene life cycle: the Expo AppDelegate template changed');
  }
  return contents
    .replace(declaration, `class AppDelegate: ExpoAppDelegate, ${PROVIDER} {`)
    .replace(WINDOW_START, '\n    // The window and React Native start in ExpoAppSceneDelegate (plugins/withSceneLifecycle.js).\n');
}

module.exports = function withSceneLifecycle(config) {
  const withManifest = withInfoPlist(config, (mod) => {
    mod.modResults = addSceneManifest(mod.modResults);
    return mod;
  });
  return withAppDelegate(withManifest, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('The scene life cycle plugin requires the Swift Expo AppDelegate');
    }
    mod.modResults.contents = adoptSceneDelegate(mod.modResults.contents);
    return mod;
  });
};

module.exports.addSceneManifest = addSceneManifest;
module.exports.adoptSceneDelegate = adoptSceneDelegate;
module.exports.SCENE_DELEGATE = SCENE_DELEGATE;
