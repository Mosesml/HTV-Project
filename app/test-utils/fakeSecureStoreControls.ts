import * as SecureStore from 'expo-secure-store';

import type { FakeSecureStoreControls } from './fakeSecureStore';

/** The in-memory Keychain jest.setup.ts installs in place of `expo-secure-store`. */
export function fakeSecureStore(): FakeSecureStoreControls {
  return (SecureStore as unknown as { __controls: FakeSecureStoreControls }).__controls;
}
