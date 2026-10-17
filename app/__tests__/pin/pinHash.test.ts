import { hashesMatch, hashPin, makeSalt, makeSaltedHash, SALT_BYTES } from '../../src/pin/pinHash';
import { nodeSha256 } from '../../test-utils/nodeCrypto';

const HEX_SHA256 = /^[0-9a-f]{64}$/;

describe('makeSalt', () => {
  test('gives 16 random bytes as lowercase hex', async () => {
    const salt = await makeSalt();
    expect(salt).toMatch(new RegExp(`^[0-9a-f]{${SALT_BYTES * 2}}$`));
  });

  test('gives a different salt every time', async () => {
    const salts = await Promise.all(Array.from({ length: 20 }, () => makeSalt()));
    expect(new Set(salts).size).toBe(20);
  });
});

describe('hashPin', () => {
  test('is SHA-256 of the salt, a colon and the PIN, in hex', async () => {
    const salt = '00112233445566778899aabbccddeeff';
    const hash = await hashPin('2468', salt);
    expect(hash).toMatch(HEX_SHA256);
    expect(hash).toBe(nodeSha256(`${salt}:2468`));
  });

  test('the same PIN with two salts gives two hashes', async () => {
    const first = await hashPin('2468', 'aa'.repeat(SALT_BYTES));
    const second = await hashPin('2468', 'bb'.repeat(SALT_BYTES));
    expect(first).not.toBe(second);
  });

  test('two PINs with one salt give two hashes', async () => {
    const salt = 'cc'.repeat(SALT_BYTES);
    expect(await hashPin('2468', salt)).not.toBe(await hashPin('2469', salt));
  });
});

describe('makeSaltedHash', () => {
  test('pairs a fresh salt with the hash of the PIN under it', async () => {
    const salted = await makeSaltedHash('13572468');
    expect(salted.hash).toBe(nodeSha256(`${salted.salt}:13572468`));
    expect(JSON.stringify(salted)).not.toContain('13572468');
  });
});

describe('hashesMatch', () => {
  test('is true only for identical strings', () => {
    expect(hashesMatch('abc123', 'abc123')).toBe(true);
    expect(hashesMatch('abc123', 'abc124')).toBe(false);
    expect(hashesMatch('abc123', 'abc12')).toBe(false);
    expect(hashesMatch('', '')).toBe(true);
  });
});
