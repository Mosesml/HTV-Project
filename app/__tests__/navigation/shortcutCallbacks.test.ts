import { redirectSystemPath } from '../../src/app/+native-intent';

describe('Shortcuts return navigation', () => {
  test.each(['success', 'cancel', 'error'])('keeps the current screen after a %s callback', (outcome) => {
    expect(redirectSystemPath({ path: `raveguard://noise/${outcome}?mode=adaptive&level=40`, initial: false })).toBeNull();
  });

  test('opens the app root for a cold-start callback so the phase can restore its screen', () => {
    expect(redirectSystemPath({ path: 'raveguard://noise/success?mode=adaptive', initial: true })).toBe('/');
  });

  test.each(['/session', 'raveguard://session', 'raveguard://noise/other', 'https://example.com/noise/success'])(
    'preserves unrelated routes: %s',
    (path) => expect(redirectSystemPath({ path, initial: false })).toBe(path)
  );
});
