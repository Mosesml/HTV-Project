import { PinValidationError } from '../../src/pin/pinRules';
import { createMemoryPinStore } from '../../src/pin/pinStore';

const PINS = { safePin: '2468', duressPin: '1357' };

describe('createMemoryPinStore (the stand-in until K6)', () => {
  test('starts with no PINs', async () => {
    const store = createMemoryPinStore();
    expect(await store.hasPins()).toBe(false);
  });

  test('keeps both PINs once set', async () => {
    const store = createMemoryPinStore();
    await store.setPins(PINS);
    expect(await store.hasPins()).toBe(true);
  });

  test('verify tells safe, duress and wrong apart', async () => {
    const store = createMemoryPinStore();
    await store.setPins(PINS);
    expect(await store.verify('2468')).toBe('safe');
    expect(await store.verify('1357')).toBe('duress');
    expect(await store.verify('0000')).toBe('wrong');
    expect(await store.verify('')).toBe('wrong');
  });

  test('every entry is wrong while no PINs are set', async () => {
    const store = createMemoryPinStore();
    expect(await store.verify('2468')).toBe('wrong');
  });

  test('refuses two equal PINs and keeps the PINs it had', async () => {
    const store = createMemoryPinStore();
    await store.setPins(PINS);
    await expect(store.setPins({ safePin: '9090', duressPin: '9090' })).rejects.toBeInstanceOf(PinValidationError);
    expect(await store.verify('2468')).toBe('safe');
  });

  test('setting new PINs replaces both old ones', async () => {
    const store = createMemoryPinStore();
    await store.setPins(PINS);
    await store.setPins({ safePin: '8642', duressPin: '7531' });
    expect(await store.verify('2468')).toBe('wrong');
    expect(await store.verify('8642')).toBe('safe');
    expect(await store.verify('7531')).toBe('duress');
  });

  test('clearPins forgets both', async () => {
    const store = createMemoryPinStore();
    await store.setPins(PINS);
    await store.clearPins();
    expect(await store.hasPins()).toBe(false);
    expect(await store.verify('2468')).toBe('wrong');
  });

  test('stores keep separate PINs', async () => {
    const first = createMemoryPinStore();
    const second = createMemoryPinStore();
    await first.setPins(PINS);
    expect(await second.hasPins()).toBe(false);
  });
});
