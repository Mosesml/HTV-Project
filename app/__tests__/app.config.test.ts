/**
 * @jest-environment node
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from '../app.json';
import buildConfig, { BUNDLE_ID_BASE } from '../app.config';

const VALID_ENV = { RG_BUNDLE_SUFFIX: 'kean', RG_APPLE_TEAM_ID: 'AB12CD34EF' };

function evaluate(env: Record<string, string | undefined>): ExpoConfig {
  const context = { config: appJson.expo } as unknown as ConfigContext;
  return buildConfig(context, env);
}

describe('app config: iOS Info.plist (K1)', () => {
  const infoPlist = evaluate(VALID_ENV).ios?.infoPlist ?? {};

  test.each([
    'NSMicrophoneUsageDescription',
    'NSMotionUsageDescription',
    'NSLocationWhenInUseUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription',
  ])('sets a non-empty %s', (key) => {
    expect(typeof infoPlist[key]).toBe('string');
    expect((infoPlist[key] as string).trim().length).toBeGreaterThan(0);
  });

  test('enables the audio and location background modes', () => {
    expect(infoPlist.UIBackgroundModes).toEqual(expect.arrayContaining(['audio', 'location']));
  });

  // The native module's podspec and Justin's Swift need iOS 17 (K2).
  test('raises the iOS deployment target to 17.0', () => {
    const plugins = evaluate(VALID_ENV).plugins ?? [];
    expect(plugins).toContainEqual(['expo-build-properties', { ios: { deploymentTarget: '17.0' } }]);
  });

  // The PIN gate (K6) keeps hashes in expo-secure-store without Face ID, so no Face ID prompt text.
  test('adds expo-secure-store without asking for Face ID', () => {
    const plugins = evaluate(VALID_ENV).plugins ?? [];
    expect(plugins).toContainEqual(['expo-secure-store', { faceIDPermission: false }]);
  });
});

describe('app config: identity', () => {
  test('registers the raveguard:// URL scheme', () => {
    expect(evaluate(VALID_ENV).scheme).toBe('raveguard');
  });

  test('builds the bundle ID from the base and the per-person suffix', () => {
    expect(evaluate(VALID_ENV).ios?.bundleIdentifier).toBe(`${BUNDLE_ID_BASE}.kean`);
  });

  test('passes the Apple team ID through when it is set', () => {
    expect(evaluate(VALID_ENV).ios?.appleTeamId).toBe('AB12CD34EF');
  });

  test('leaves the team ID unset so Expo CLI picks one when it is missing', () => {
    const config = evaluate({ RG_BUNDLE_SUFFIX: 'kean' });
    expect(config.ios?.appleTeamId).toBeUndefined();
    expect(config.ios?.bundleIdentifier).toBe(`${BUNDLE_ID_BASE}.kean`);
  });
});

describe('app config: fails fast on bad local settings', () => {
  test('throws a setup hint when the bundle suffix is missing', () => {
    expect(() => evaluate({})).toThrow(/RG_BUNDLE_SUFFIX.*\.env\.example/s);
  });

  test.each(['Kean', 'kean y', 'kean.y', ''])('rejects the bundle suffix %p', (suffix) => {
    expect(() => evaluate({ RG_BUNDLE_SUFFIX: suffix })).toThrow(/RG_BUNDLE_SUFFIX/);
  });

  test.each(['abc', 'ab12cd34ef', 'AB12CD34EF1'])('rejects the team ID %p', (teamId) => {
    expect(() => evaluate({ RG_BUNDLE_SUFFIX: 'kean', RG_APPLE_TEAM_ID: teamId })).toThrow(
      /RG_APPLE_TEAM_ID/
    );
  });
});
