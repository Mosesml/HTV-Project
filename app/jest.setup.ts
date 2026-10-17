// Every app test runs against the JavaScript stand-in for the Swift module (modules/raveguard-native/src/mock.ts).
// Tests reach it with `nativeMock()` from test-utils/nativeMock.ts.
jest.mock('./modules/raveguard-native/src/RaveGuardNativeModule', () => {
  const { createMockRaveGuardNative } = jest.requireActual('./modules/raveguard-native/src/mock');
  return { __esModule: true, default: createMockRaveGuardNative() };
});
