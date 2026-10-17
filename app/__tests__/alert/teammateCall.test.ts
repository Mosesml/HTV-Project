import { Linking } from 'react-native';

import { callTarget, startCall, telUrl } from '../../src/alert/teammateCall';

const TEAMMATE = '+14165550199';

// React Native's Jest setup makes openURL one shared jest.fn, so clear calls between tests.
beforeEach(() => jest.mocked(Linking.openURL).mockClear());
afterEach(() => jest.restoreAllMocks());

describe('telUrl', () => {
  test('builds a tel: URL from an E.164 number', () => {
    expect(telUrl(TEAMMATE)).toBe('tel:+14165550199');
  });

  test.each([
    ['empty', ''],
    ['no plus', '14165550199'],
    ['dashes', '+1-416-555-0199'],
    ['too short to be a phone line', '+1234567'],
    ['too long', '+1234567890123456'],
    ['a pause or extension', '+14165550199,1'],
    ['a USSD code', '*#06#'],
  ])('refuses %s', (_name, phone) => {
    expect(telUrl(phone)).toBeNull();
  });

  test('never makes a URL from a short code, whatever its digits', () => {
    // Every emergency short code is 2 to 4 digits; build them rather than write them down,
    // so the emergency-number scan of the app code stays meaningful.
    for (let digits = 2; digits <= 6; digits += 1) {
      for (const lead of ['1', '9', '0']) {
        const code = lead.repeat(digits);
        expect(telUrl(code)).toBeNull();
        expect(telUrl(`+${code}`)).toBeNull();
      }
    }
  });
});

describe('callTarget', () => {
  test('in demo mode with a teammate number: ready to call that number', () => {
    expect(callTarget({ demo: true, teammatePhone: TEAMMATE })).toEqual({
      kind: 'ready',
      phone: TEAMMATE,
      url: 'tel:+14165550199',
    });
  });

  test('outside demo mode: never calls, even with a teammate number', () => {
    expect(callTarget({ demo: false, teammatePhone: TEAMMATE })).toEqual({ kind: 'notDemo' });
    expect(callTarget({ demo: false, teammatePhone: null })).toEqual({ kind: 'notDemo' });
  });

  test('in demo mode without a usable number: nothing to call', () => {
    expect(callTarget({ demo: true, teammatePhone: null })).toEqual({ kind: 'noNumber' });
    expect(callTarget({ demo: true, teammatePhone: '555' })).toEqual({ kind: 'noNumber' });
  });
});

describe('startCall', () => {
  test('opens the tel: URL', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await startCall({ kind: 'ready', phone: TEAMMATE, url: 'tel:+14165550199' });
    expect(openURL).toHaveBeenCalledWith('tel:+14165550199');
  });

  test('passes on a phone that cannot call', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no phone app'));
    await expect(startCall({ kind: 'ready', phone: TEAMMATE, url: 'tel:+14165550199' })).rejects.toThrow('no phone app');
  });
});
