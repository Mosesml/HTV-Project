import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { appPinStore, PinStoreProvider, usePins } from '../../src/pin/PinStoreProvider';
import type { PinStore } from '../../src/pin/pinStore';
import { PIN_RECORD_KEY } from '../../src/pin/securePinStore';
import { fakeSecureStore } from '../../test-utils/fakeSecureStoreControls';

beforeEach(() => fakeSecureStore().reset());

function Probe() {
  const { isLoaded, hasPins } = usePins();
  return <Text>{`loaded=${isLoaded} pins=${hasPins}`}</Text>;
}

function storeWith(overrides: Partial<PinStore>): PinStore {
  return {
    hasPins: async () => false,
    setPins: async () => {},
    verify: async () => 'wrong',
    clearPins: async () => {},
    ...overrides,
  };
}

describe('appPinStore (K6)', () => {
  test('keeps the PINs as salted hashes in the Keychain', async () => {
    await appPinStore().setPins({ safePin: '24681357', duressPin: '97531086' });
    const stored = fakeSecureStore().items.get(PIN_RECORD_KEY);
    expect(stored).toBeDefined();
    expect(stored).not.toContain('24681357');
    expect(stored).not.toContain('97531086');
    expect(await appPinStore().verify('24681357')).toBe('safe');
    expect(await appPinStore().verify('97531086')).toBe('duress');
  });

  test('is one store for the whole app', () => {
    expect(appPinStore()).toBe(appPinStore());
  });
});

describe('PinStoreProvider', () => {
  test('reports PINs saved before this launch', async () => {
    render(
      <PinStoreProvider store={storeWith({ hasPins: async () => true })}>
        <Probe />
      </PinStoreProvider>
    );
    expect(await screen.findByText('loaded=true pins=true')).toBeTruthy();
  });

  test('a Keychain failure at launch still finishes loading, with no PINs', async () => {
    render(
      <PinStoreProvider store={storeWith({ hasPins: () => Promise.reject(new Error('errSecInteractionNotAllowed')) })}>
        <Probe />
      </PinStoreProvider>
    );
    expect(await screen.findByText('loaded=true pins=false')).toBeTruthy();
  });
});
