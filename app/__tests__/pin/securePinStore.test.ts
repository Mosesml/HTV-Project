import * as SecureStore from 'expo-secure-store';

import { PinValidationError } from '../../src/pin/pinRules';
import {
  createSecurePinStore,
  PIN_RECORD_KEY,
  PIN_RECORD_VERSION,
  SECURE_STORE_OPTIONS,
} from '../../src/pin/securePinStore';
import { fakeSecureStore } from '../../test-utils/fakeSecureStoreControls';
import { nodeSha256 } from '../../test-utils/nodeCrypto';

// 8-digit PINs, so a random hex hash or salt can't contain one by chance in the "not stored in
// plain text" checks.
const SAFE_PIN = '24681357';
const DURESS_PIN = '97531086';
const PINS = { safePin: SAFE_PIN, duressPin: DURESS_PIN };

beforeEach(() => fakeSecureStore().reset());

function storedText(): string {
  const value = fakeSecureStore().items.get(PIN_RECORD_KEY);
  if (value === undefined) throw new Error('No PIN record stored');
  return value;
}

type StoredHash = { salt: string; hash: string };
function storedRecord(): { version: number; algorithm: string; safe: StoredHash; duress: StoredHash } {
  return JSON.parse(storedText());
}

describe('createSecurePinStore: the three results (K6 done-when)', () => {
  test('the safe PIN verifies as safe', async () => {
    const store = createSecurePinStore();
    await store.setPins(PINS);
    expect(await store.verify(SAFE_PIN)).toBe('safe');
  });

  test('the duress PIN verifies as duress', async () => {
    const store = createSecurePinStore();
    await store.setPins(PINS);
    expect(await store.verify(DURESS_PIN)).toBe('duress');
  });

  test('anything else verifies as wrong', async () => {
    const store = createSecurePinStore();
    await store.setPins(PINS);
    for (const entry of ['', '0000', '2468135', '246813570', '24681358', `${SAFE_PIN} `, 'abcd', '1111', '9999']) {
      expect(await store.verify(entry)).toBe('wrong');
    }
  });

  test('every entry is wrong while no PINs are set', async () => {
    const store = createSecurePinStore();
    expect(await store.verify(SAFE_PIN)).toBe('wrong');
    expect(await store.verify('1111')).toBe('wrong');
  });
});

describe('createSecurePinStore: what is stored', () => {
  test('neither PIN is stored in plain text', async () => {
    await createSecurePinStore().setPins(PINS);
    const text = storedText();
    expect(text).not.toContain(SAFE_PIN);
    expect(text).not.toContain(DURESS_PIN);
    const record = storedRecord();
    expect(record.safe.hash).not.toBe(SAFE_PIN);
    expect(record.duress.hash).not.toBe(DURESS_PIN);
  });

  test('each PIN is stored as SHA-256 of its own salt and the PIN', async () => {
    await createSecurePinStore().setPins(PINS);
    const record = storedRecord();
    expect(record).toEqual({
      version: PIN_RECORD_VERSION,
      algorithm: 'SHA-256',
      safe: { salt: expect.stringMatching(/^[0-9a-f]{32}$/), hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      duress: { salt: expect.stringMatching(/^[0-9a-f]{32}$/), hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
    });
    expect(record.safe.hash).toBe(nodeSha256(`${record.safe.salt}:${SAFE_PIN}`));
    expect(record.duress.hash).toBe(nodeSha256(`${record.duress.salt}:${DURESS_PIN}`));
    expect(record.safe.salt).not.toBe(record.duress.salt);
  });

  test('saving the same PINs again uses fresh salts', async () => {
    const store = createSecurePinStore();
    await store.setPins(PINS);
    const first = storedRecord();
    await store.setPins(PINS);
    const second = storedRecord();
    expect(second.safe.salt).not.toBe(first.safe.salt);
    expect(second.safe.hash).not.toBe(first.safe.hash);
    expect(second.duress.salt).not.toBe(first.duress.salt);
  });

  test('both PINs live in one Keychain item, kept on this device only', async () => {
    const store = createSecurePinStore();
    await store.setPins(PINS);
    await store.verify(SAFE_PIN);
    await store.hasPins();
    await store.clearPins();
    expect([...fakeSecureStore().items.keys()]).toEqual([]);
    const { calls } = fakeSecureStore();
    expect(calls.map((call) => call.method)).toEqual(['setItemAsync', 'getItemAsync', 'getItemAsync', 'deleteItemAsync']);
    for (const call of calls) {
      expect(call.key).toBe(PIN_RECORD_KEY);
      expect(call.options).toEqual(SECURE_STORE_OPTIONS);
    }
    expect(SECURE_STORE_OPTIONS.keychainAccessible).toBe(SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY);
  });
});

describe('createSecurePinStore: saving and clearing', () => {
  test('starts with no PINs', async () => {
    expect(await createSecurePinStore().hasPins()).toBe(false);
  });

  test('has PINs once set, and a second store sees them (the Keychain outlives the app)', async () => {
    await createSecurePinStore().setPins(PINS);
    const relaunched = createSecurePinStore();
    expect(await relaunched.hasPins()).toBe(true);
    expect(await relaunched.verify(SAFE_PIN)).toBe('safe');
    expect(await relaunched.verify(DURESS_PIN)).toBe('duress');
  });

  test('refuses two equal PINs, writes nothing and keeps the PINs it had', async () => {
    const store = createSecurePinStore();
    await store.setPins(PINS);
    const before = storedText();
    await expect(store.setPins({ safePin: '9090', duressPin: '9090' })).rejects.toBeInstanceOf(PinValidationError);
    expect(storedText()).toBe(before);
    expect(await store.verify(SAFE_PIN)).toBe('safe');
  });

  test('refuses PINs that break the rules without naming them in the error', async () => {
    const store = createSecurePinStore();
    const attempt = store.setPins({ safePin: '12', duressPin: '12ab' });
    await expect(attempt).rejects.toBeInstanceOf(PinValidationError);
    await attempt.catch((error: Error) => {
      expect(error.message).not.toContain('12ab');
    });
    expect(fakeSecureStore().items.size).toBe(0);
  });

  test('setting new PINs replaces both old ones', async () => {
    const store = createSecurePinStore();
    await store.setPins(PINS);
    await store.setPins({ safePin: '8642', duressPin: '7531' });
    expect(await store.verify(SAFE_PIN)).toBe('wrong');
    expect(await store.verify(DURESS_PIN)).toBe('wrong');
    expect(await store.verify('8642')).toBe('safe');
    expect(await store.verify('7531')).toBe('duress');
  });

  test('a failed Keychain write rejects and keeps the old PINs', async () => {
    const store = createSecurePinStore();
    await store.setPins(PINS);
    fakeSecureStore().failNext('setItemAsync', new Error('errSecInteractionNotAllowed'));
    await expect(store.setPins({ safePin: '8642', duressPin: '7531' })).rejects.toThrow('errSecInteractionNotAllowed');
    expect(await store.verify(SAFE_PIN)).toBe('safe');
    expect(await store.verify('8642')).toBe('wrong');
  });

  test('clearPins forgets both', async () => {
    const store = createSecurePinStore();
    await store.setPins(PINS);
    await store.clearPins();
    expect(await store.hasPins()).toBe(false);
    expect(await store.verify(SAFE_PIN)).toBe('wrong');
    expect(await store.verify(DURESS_PIN)).toBe('wrong');
  });

  test('clearPins with nothing stored is fine', async () => {
    await expect(createSecurePinStore().clearPins()).resolves.toBeUndefined();
  });
});

describe('createSecurePinStore: failures and damaged records', () => {
  test('verify rejects when the Keychain cannot be read, so the screen can say so', async () => {
    const store = createSecurePinStore();
    await store.setPins(PINS);
    fakeSecureStore().failNext('getItemAsync', new Error('errSecInteractionNotAllowed'));
    await expect(store.verify(SAFE_PIN)).rejects.toThrow('errSecInteractionNotAllowed');
    expect(await store.verify(SAFE_PIN)).toBe('safe');
  });

  test.each([
    ['not JSON', '{nope'],
    ['JSON null', 'null'],
    ['an older or newer version', JSON.stringify({ version: 99, algorithm: 'SHA-256', safe: {}, duress: {} })],
    ['another algorithm', JSON.stringify({ version: 1, algorithm: 'MD5', safe: { salt: 'aa', hash: 'bb' }, duress: { salt: 'cc', hash: 'dd' } })],
    ['a missing duress hash', JSON.stringify({ version: 1, algorithm: 'SHA-256', safe: { salt: 'aa', hash: 'bb' } })],
    ['a hash that is not a string', JSON.stringify({ version: 1, algorithm: 'SHA-256', safe: { salt: 'aa', hash: 4 }, duress: { salt: 'cc', hash: 'dd' } })],
    ['an empty salt', JSON.stringify({ version: 1, algorithm: 'SHA-256', safe: { salt: '', hash: 'bb' }, duress: { salt: 'cc', hash: 'dd' } })],
    ['a plain PIN from some old build', JSON.stringify({ safePin: SAFE_PIN, duressPin: DURESS_PIN })],
  ])('a damaged record (%s) reads as no PINs and every entry is wrong', async (_label, value) => {
    fakeSecureStore().seed(PIN_RECORD_KEY, value);
    const store = createSecurePinStore();
    expect(await store.hasPins()).toBe(false);
    expect(await store.verify(SAFE_PIN)).toBe('wrong');
    expect(await store.verify(DURESS_PIN)).toBe('wrong');
  });

  test('a damaged record is replaced by the next setPins', async () => {
    fakeSecureStore().seed(PIN_RECORD_KEY, '{nope');
    const store = createSecurePinStore();
    await store.setPins(PINS);
    expect(await store.verify(DURESS_PIN)).toBe('duress');
  });
});
