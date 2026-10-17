import * as SecureStore from 'expo-secure-store';

import type { PinResultKind } from '../../modules/raveguard-native';
import { hashesMatch, hashPin, makeSaltedHash, PIN_HASH_ALGORITHM, type SaltedHash } from './pinHash';
import { assertValidPins } from './pinRules';
import type { PinStore } from './pinStore';

// The PIN gate's store (K6, PRD D6 and PRV-4): both PINs as salted hashes in one Keychain item
// through expo-secure-store. One item means a save replaces both PINs at once or not at all.
//
// Duress rule: verify() always hashes the entry under both salts before comparing, so a safe,
// a duress and a wrong PIN all take the same work. Counting wrong attempts is Swift's job
// (pinResult); this store only says which PIN an entry is.

export const PIN_RECORD_KEY = 'raveguard.pins';
export const PIN_RECORD_VERSION = 1;

/**
 * Readable whenever the app runs after the phone's first unlock since boot (so a launch in the
 * background still knows whether PINs are set), and never copied to a backup or a new phone.
 */
export const SECURE_STORE_OPTIONS: Readonly<SecureStore.SecureStoreOptions> = Object.freeze({
  keychainService: 'raveguard',
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
});

interface PinRecord {
  version: typeof PIN_RECORD_VERSION;
  algorithm: typeof PIN_HASH_ALGORITHM;
  safe: SaltedHash;
  duress: SaltedHash;
}

function isSaltedHash(value: unknown): value is SaltedHash {
  if (typeof value !== 'object' || value === null) return false;
  const { salt, hash } = value as Record<string, unknown>;
  return typeof salt === 'string' && salt !== '' && typeof hash === 'string' && hash !== '';
}

/** The stored record, or null when there is none or it can't be trusted (read as "no PINs"). */
function parsePinRecord(text: string | null): PinRecord | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== PIN_RECORD_VERSION || record.algorithm !== PIN_HASH_ALGORITHM) return null;
  if (!isSaltedHash(record.safe) || !isSaltedHash(record.duress)) return null;
  return { version: PIN_RECORD_VERSION, algorithm: PIN_HASH_ALGORITHM, safe: record.safe, duress: record.duress };
}

async function readRecord(): Promise<PinRecord | null> {
  return parsePinRecord(await SecureStore.getItemAsync(PIN_RECORD_KEY, SECURE_STORE_OPTIONS));
}

export function createSecurePinStore(): PinStore {
  return {
    hasPins: async () => (await readRecord()) !== null,

    setPins: async (pins) => {
      // Before anything is written, so refused PINs leave the old ones in place.
      assertValidPins(pins);
      const [safe, duress] = await Promise.all([makeSaltedHash(pins.safePin), makeSaltedHash(pins.duressPin)]);
      const record: PinRecord = { version: PIN_RECORD_VERSION, algorithm: PIN_HASH_ALGORITHM, safe, duress };
      await SecureStore.setItemAsync(PIN_RECORD_KEY, JSON.stringify(record), SECURE_STORE_OPTIONS);
    },

    verify: async (entry): Promise<PinResultKind> => {
      const record = await readRecord();
      if (record === null) return 'wrong';
      const [safeHash, duressHash] = await Promise.all([
        hashPin(entry, record.safe.salt),
        hashPin(entry, record.duress.salt),
      ]);
      const isSafe = hashesMatch(safeHash, record.safe.hash);
      const isDuress = hashesMatch(duressHash, record.duress.hash);
      if (isSafe) return 'safe';
      if (isDuress) return 'duress';
      return 'wrong';
    },

    clearPins: async () => {
      await SecureStore.deleteItemAsync(PIN_RECORD_KEY, SECURE_STORE_OPTIONS);
    },
  };
}
