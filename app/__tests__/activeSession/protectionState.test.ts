import type { NoiseEvent } from '../../modules/raveguard-native';
import {
  INITIAL_PROTECTION,
  protectionReducer,
  sliderLevel,
  toProtectionLevel,
  type ProtectionState,
} from '../../src/activeSession/protectionState';

function noise(level: number): NoiseEvent {
  return { backend: 'off', connected: false, level };
}

describe('toProtectionLevel', () => {
  test('rounds the slider value to a whole level', () => {
    expect(toProtectionLevel(54.6)).toBe(55);
    expect(toProtectionLevel(54.4)).toBe(54);
  });

  test('clamps to 0–100', () => {
    expect(toProtectionLevel(-3)).toBe(0);
    expect(toProtectionLevel(100.4)).toBe(100);
    expect(toProtectionLevel(140)).toBe(100);
  });

  test('treats a value that is not finite as 0', () => {
    expect(toProtectionLevel(Number.NaN)).toBe(0);
  });
});

describe('protectionReducer', () => {
  test('starts with nothing known', () => {
    expect(INITIAL_PROTECTION).toEqual({ noise: null, chosen: null });
    expect(sliderLevel(INITIAL_PROTECTION)).toBe(0);
  });

  test('takes the snapshot only while no onNoise has arrived (an event is newer)', () => {
    const fromSnapshot = protectionReducer(INITIAL_PROTECTION, { type: 'snapshot', noise: noise(30) });
    expect(fromSnapshot.noise).toEqual(noise(30));
    const afterEvent = protectionReducer(INITIAL_PROTECTION, { type: 'noise', noise: noise(60) });
    const lateSnapshot = protectionReducer(afterEvent, { type: 'snapshot', noise: noise(30) });
    expect(lateSnapshot.noise).toEqual(noise(60));
  });

  test('the slider follows onNoise when the wearer has not moved it', () => {
    const state = protectionReducer(INITIAL_PROTECTION, { type: 'noise', noise: noise(45) });
    expect(sliderLevel(state)).toBe(45);
  });

  test('a chosen level holds the slider until onNoise confirms it', () => {
    const start: ProtectionState = { noise: noise(20), chosen: null };
    const chosen = protectionReducer(start, { type: 'choose', level: 80 });
    expect(sliderLevel(chosen)).toBe(80);
    const lagging = protectionReducer(chosen, { type: 'noise', noise: noise(50) });
    expect(lagging).toEqual({ noise: noise(50), chosen: 80 });
    expect(sliderLevel(lagging)).toBe(80);
    const confirmed = protectionReducer(lagging, { type: 'noise', noise: noise(80) });
    expect(confirmed).toEqual({ noise: noise(80), chosen: null });
  });

  test('a failed call lets the slider go back to the confirmed level', () => {
    const chosen = protectionReducer({ noise: noise(20), chosen: null }, { type: 'choose', level: 90 });
    const failed = protectionReducer(chosen, { type: 'failed' });
    expect(failed).toEqual({ noise: noise(20), chosen: null });
    expect(sliderLevel(failed)).toBe(20);
  });

  test('returns new objects and leaves the old state alone', () => {
    const start: ProtectionState = { noise: noise(20), chosen: null };
    const next = protectionReducer(start, { type: 'choose', level: 40 });
    expect(next).not.toBe(start);
    expect(start).toEqual({ noise: noise(20), chosen: null });
  });
});
