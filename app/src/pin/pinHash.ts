import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync, getRandomBytesAsync } from 'expo-crypto';

// Salting and hashing for the PIN gate (K6, PRD PRV-4). A PIN is never stored: only a random
// salt and SHA-256 of `salt:pin`. With 4 to 8 digit PINs a slower hash would not stop an
// attacker who has the salt and hash (10^8 guesses is cheap), so the protection is the
// Keychain item itself (see securePinStore.ts); the salt stops two equal PINs, or the same PIN
// saved twice, from ever looking the same.

export const PIN_HASH_ALGORITHM = CryptoDigestAlgorithm.SHA256;
export const SALT_BYTES = 16;

export interface SaltedHash {
  /** Lowercase hex, SALT_BYTES random bytes. */
  salt: string;
  /** Lowercase hex SHA-256 of `${salt}:${pin}`. */
  hash: string;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A fresh random salt. */
export async function makeSalt(): Promise<string> {
  return toHex(await getRandomBytesAsync(SALT_BYTES));
}

/** SHA-256 of `${salt}:${pin}`, lowercase hex. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  return digestStringAsync(PIN_HASH_ALGORITHM, `${salt}:${pin}`, { encoding: CryptoEncoding.HEX });
}

/** A fresh salt and the PIN's hash under it. */
export async function makeSaltedHash(pin: string): Promise<SaltedHash> {
  const salt = await makeSalt();
  return { salt, hash: await hashPin(pin, salt) };
}

/** Compares two hashes without stopping at the first difference. */
export function hashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}
