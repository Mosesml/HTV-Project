// Every app test runs against the JavaScript stand-in for the Swift module (modules/raveguard-native/src/mock.ts).
// Tests reach it with `nativeMock()` from test-utils/nativeMock.ts.
jest.mock('./modules/raveguard-native/src/RaveGuardNativeModule', () => {
  const { createMockRaveGuardNative } = jest.requireActual('./modules/raveguard-native/src/mock');
  return { __esModule: true, default: createMockRaveGuardNative() };
});

// Settings storage (K4) writes through expo-file-system and makes ids with expo-crypto; the PIN
// store (K6) salts and hashes with expo-crypto and keeps the hashes in expo-secure-store. None
// of them has a native side under Jest. Tests reach the in-memory files with `fakeFileSystem()`
// from test-utils/fakeFiles.ts and the in-memory Keychain with `fakeSecureStore()` from
// test-utils/fakeSecureStoreControls.ts.
jest.mock('expo-file-system', () => jest.requireActual('./test-utils/fakeFileSystem').fakeExpoFileSystem);
jest.mock('expo-crypto', () => jest.requireActual('./test-utils/fakeCrypto').fakeExpoCrypto);
jest.mock('expo-secure-store', () => jest.requireActual('./test-utils/fakeSecureStore').fakeExpoSecureStore);

// The cancel haptic (K9). Tests read what was played with `fakeHaptics()` from
// test-utils/fakeHapticsControls.ts.
jest.mock('expo-haptics', () => jest.requireActual('./test-utils/fakeHaptics').fakeExpoHaptics);

// The fonts (src/ui/fonts.ts) are bundled assets with nothing to load under Jest, so the root
// layout renders straight away instead of waiting on the splash screen.
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), useFonts: () => [true, null] }));
