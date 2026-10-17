import {
  assertValidPins,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  PinValidationError,
  validatePins,
} from '../../src/pin/pinRules';

describe('validatePins', () => {
  test('accepts two different PINs of 4 to 8 digits', () => {
    expect(validatePins({ safePin: '2468', duressPin: '13579' })).toEqual([]);
    expect(validatePins({ safePin: '1'.repeat(PIN_MIN_LENGTH), duressPin: '2'.repeat(PIN_MAX_LENGTH) })).toEqual([]);
  });

  test('PINs must differ: the same PIN twice is refused on the duress PIN', () => {
    expect(validatePins({ safePin: '2468', duressPin: '2468' })).toEqual([
      { field: 'duressPin', message: 'Must be different from your safe PIN' },
    ]);
  });

  test('asks for both PINs when they are blank', () => {
    expect(validatePins({ safePin: '', duressPin: '' })).toEqual([
      { field: 'safePin', message: 'Enter 4 to 8 digits' },
      { field: 'duressPin', message: 'Enter 4 to 8 digits' },
    ]);
  });

  test('refuses anything but digits', () => {
    expect(validatePins({ safePin: '12a4', duressPin: '12 34' })).toEqual([
      { field: 'safePin', message: 'Use digits only' },
      { field: 'duressPin', message: 'Use digits only' },
    ]);
  });

  test('refuses PINs that are too short or too long', () => {
    expect(validatePins({ safePin: '123', duressPin: '123456789' })).toEqual([
      { field: 'safePin', message: 'Use 4 to 8 digits' },
      { field: 'duressPin', message: 'Use 4 to 8 digits' },
    ]);
  });

  test('does not compare PINs that are already invalid', () => {
    expect(validatePins({ safePin: '12', duressPin: '12' })).toEqual([
      { field: 'safePin', message: 'Use 4 to 8 digits' },
      { field: 'duressPin', message: 'Use 4 to 8 digits' },
    ]);
  });
});

describe('assertValidPins', () => {
  test('returns quietly for valid PINs', () => {
    expect(() => assertValidPins({ safePin: '2468', duressPin: '1357' })).not.toThrow();
  });

  test('throws PinValidationError listing the issues, without the PINs themselves', () => {
    let caught: unknown;
    try {
      assertValidPins({ safePin: '2468', duressPin: '2468' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PinValidationError);
    const error = caught as PinValidationError;
    expect(error.issues).toEqual([{ field: 'duressPin', message: 'Must be different from your safe PIN' }]);
    expect(error.message).toBe('PINs not saved: duressPin Must be different from your safe PIN');
    expect(error.message).not.toContain('2468');
  });
});
