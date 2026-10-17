import { parseTeammatePhone } from '../../src/settings/teammatePhone';

describe('parseTeammatePhone', () => {
  test('blank means no teammate number', () => {
    expect(parseTeammatePhone('')).toBeNull();
    expect(parseTeammatePhone('   ')).toBeNull();
  });

  test('drops spaces, dashes, dots and brackets people type', () => {
    expect(parseTeammatePhone(' +1 (416) 555-0199 ')).toBe('+14165550199');
    expect(parseTeammatePhone('+1.416.555.0199')).toBe('+14165550199');
  });

  test('leaves anything else for validation to reject', () => {
    expect(parseTeammatePhone('4165550199')).toBe('4165550199');
    expect(parseTeammatePhone('+1416555019x')).toBe('+1416555019x');
  });
});
