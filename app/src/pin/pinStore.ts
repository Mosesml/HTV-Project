import type { PinResultKind } from '../../modules/raveguard-native';
import { assertValidPins, type PinPair } from './pinRules';

// Where the two PINs live. The setup flow (K5) hands them over with setPins; the PIN gate
// (K6) implements this interface with salted hashes in expo-secure-store and makes the PIN
// entry screen call verify(). Until then the app uses the in-memory store below, so PINs set
// in Setup are forgotten when the app is killed.

export interface PinStore {
  /** True once both PINs are stored. */
  hasPins(): Promise<boolean>;
  /**
   * Replaces both PINs. Rejects with PinValidationError (and keeps the old PINs) unless they
   * pass validatePins: 4 to 8 digits each, and different from each other.
   */
  setPins(pins: PinPair): Promise<void>;
  /** Which PIN `entry` is. Counting wrong attempts is Swift's job (pinResult). */
  verify(entry: string): Promise<PinResultKind>;
  /** Forgets both PINs. */
  clearPins(): Promise<void>;
}

/** Keeps the PINs in memory, in plain text: a stand-in for tests and until K6. */
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
