import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';

import type { PinPair } from './pinRules';
import type { PinStore } from './pinStore';
import { createSecurePinStore } from './securePinStore';

// Whether the wearer has set their PINs, for every screen (K5). Screens read it with
// usePins(); Setup saves new PINs with savePins; the PIN entry screen checks an entry with
// store.verify(). The app's store keeps salted hashes in expo-secure-store (K6).

export interface PinState {
  /** False until the store has been asked; `hasPins` is false until then. */
  isLoaded: boolean;
  hasPins: boolean;
  /** Stores both PINs. Rejects with PinValidationError if they break the rules. */
  savePins(pins: PinPair): Promise<void>;
  /** Forgets both PINs. */
  clearPins(): Promise<void>;
  /** The store itself, for the PIN entry screen to call verify() on. */
  store: PinStore;
}

const PinContext = createContext<PinState | null>(null);

let defaultStore: PinStore | null = null;

/** The PIN store the app uses (salted hashes in the Keychain), made on first use. */
export function appPinStore(): PinStore {
  defaultStore ??= createSecurePinStore();
  return defaultStore;
}

type Props = {
  children: ReactNode;
  /** Defaults to appPinStore(). */
  store?: PinStore;
};

export function PinStoreProvider({ children, store: injected }: Props) {
  const store = injected ?? appPinStore();
  const [hasPins, setHasPins] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  // A save or clear that lands before the launch read finishes wins over it.
  const hasLocalChange = useRef(false);

  useEffect(() => {
    let isMounted = true;
    store
      .hasPins()
      // A Keychain that can't be read counts as "no PINs": Setup then asks for them again.
      .catch(() => false)
      .then((stored) => {
        if (!isMounted) return;
        if (!hasLocalChange.current) setHasPins(stored);
        setIsLoaded(true);
      });
    return () => {
      isMounted = false;
    };
  }, [store]);

  const savePins = async (pins: PinPair): Promise<void> => {
    await store.setPins(pins);
    hasLocalChange.current = true;
    setHasPins(true);
  };

  const clearPins = async (): Promise<void> => {
    await store.clearPins();
    hasLocalChange.current = true;
    setHasPins(false);
  };

  const value: PinState = { isLoaded, hasPins, savePins, clearPins, store };
  return <PinContext value={value}>{children}</PinContext>;
}

export function usePins(): PinState {
  const value = use(PinContext);
  if (!value) throw new Error('usePins must be used inside PinStoreProvider');
  return value;
}
