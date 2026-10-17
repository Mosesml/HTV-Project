import type { PinResultKind } from '../../modules/raveguard-native';
import { assertValidPins, type PinPair } from './pinRules';

// Where the two PINs live. The setup flow (K5) hands them over with setPins; the PIN entry
// screen asks verify(). The app uses createSecurePinStore() (securePinStore.ts, K6: salted
// hashes in expo-secure-store); the in-memory store below is for tests that need a PinStore
// without the Keychain.

export interface PinStore {
  /** True once both PINs are stored. */
  hasPins(): Promise<boolean>;
  /**
   * Replaces both PINs. Rejects with PinValidationError (and keeps the old PINs) unless they
   * pass validatePins: 4 to 8 digits each, and different from each other.
   */
  setPins(pins: PinPair): Promise<void>;
  /**
   * Which PIN `entry` is; 'wrong' while no PINs are set. Rejects if the PINs can't be read.
   * Counting wrong attempts is Swift's job (pinResult).
   */
  verify(entry: string): Promise<PinResultKind>;
  /** Forgets both PINs. */
  clearPins(): Promise<void>;
}

/** Keeps the PINs in memory, in plain text: a stand-in for tests only. */
export function createMemoryPinStore(): PinStore {
  let pins: PinPair | null = null;

  return {
    hasPins: async () => pins !== null,
    setPins: async (next) => {
      assertValidPins(next);
      pins = { ...next };
    },
    verify: async (entry) => {
      if (pins === null) return 'wrong';
      if (entry === pins.safePin) return 'safe';
      if (entry === pins.duressPin) return 'duress';
      return 'wrong';
    },
    clearPins: async () => {
      pins = null;
    },
  };
}
