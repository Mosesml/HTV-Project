// Every app test runs against the JavaScript stand-in for the Swift module (modules/raveguard-native/src/mock.ts).
// Tests reach it with `nativeMock()` from test-utils/nativeMock.ts.
jest.mock('./modules/raveguard-native/src/RaveGuardNativeModule', () => {
  const { createMockRaveGuardNative } = jest.requireActual('./modules/raveguard-native/src/mock');
  return { __esModule: true, default: createMockRaveGuardNative() };
});

// Settings storage (K4) writes through expo-file-system and makes ids with expo-crypto; neither
// has a native side under Jest. Tests reach the in-memory files with `fakeFileSystem()` from
// test-utils/fakeFiles.ts.
jest.mock('expo-file-system', () => jest.requireActual('./test-utils/fakeFileSystem').fakeExpoFileSystem);
type MockNodeCrypto = { randomUUID(): string };
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: () => jest.requireActual<MockNodeCrypto>('crypto').randomUUID(),
}));
