/** @jest-environment node */
import { addSceneManifest, adoptSceneDelegate, SCENE_DELEGATE } from '../plugins/withSceneLifecycle';

// Expo 57's prebuild AppDelegate, as generated (the part this plugin edits).
const TEMPLATE = `@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

test('declares one window scene run by Expo’s scene delegate, keeping the rest of Info.plist', () => {
  const plist = addSceneManifest({ CFBundleName: 'RaveGuard' });
  expect(plist.CFBundleName).toBe('RaveGuard');
  expect(plist.UIApplicationSceneManifest).toEqual({
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: SCENE_DELEGATE },
      ],
    },
  });
});

test('the app delegate provides the factory and no longer creates a window or starts React Native', () => {
  const result = adoptSceneDelegate(TEMPLATE);
  expect(result).toContain('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
  expect(result).toContain('reactNativeFactory = factory');
  expect(result).toContain('var window: UIWindow?');
  expect(result).not.toContain('UIWindow(frame:');
  expect(result).not.toContain('startReactNative');
  expect(result).toContain('return super.application(application, didFinishLaunchingWithOptions: launchOptions)');
  expect(adoptSceneDelegate(result)).toBe(result);
});

test('fails visibly when a changed Expo app delegate no longer matches', () => {
  expect(() => adoptSceneDelegate('class AppDelegate: ExpoAppDelegate {}')).toThrow(/template changed/);
});
