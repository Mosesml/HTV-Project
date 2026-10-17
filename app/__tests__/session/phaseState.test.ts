import type { PhaseEvent } from '../../modules/raveguard-native';
import { seePhase } from '../../src/session/phaseState';
import { PHASES } from '../../test-utils/nativeMock';

const T0 = 1_800_000_000_000;
const WHISPER: PhaseEvent = { ...PHASES.whisper, stageEndsAt: T0 + 10_000 };
const LOUD: PhaseEvent = { ...PHASES.loud, stageEndsAt: T0 + 20_000 };

describe('seePhase', () => {
  test('stamps the first event with the time it arrived', () => {
    expect(seePhase(null, WHISPER, T0)).toEqual({ event: WHISPER, seenAt: T0 });
  });

  test('keeps the first time for a repeat of the same step', () => {
    const first = seePhase(null, WHISPER, T0);
    expect(seePhase(first, { ...WHISPER }, T0 + 3_000)).toEqual({ event: WHISPER, seenAt: T0 });
  });

  test('takes the newer event of the same step, keeping its time', () => {
    const first = seePhase(null, PHASES.pinGate, T0);
    const withId: PhaseEvent = { ...PHASES.pinGate, escalationId: 'esc-2' };
    expect(seePhase(first, withId, T0 + 1_000)).toEqual({ event: withId, seenAt: T0 });
  });

  test('restamps when the stage changes', () => {
    const first = seePhase(null, WHISPER, T0);
    expect(seePhase(first, LOUD, T0 + 10_000)).toEqual({ event: LOUD, seenAt: T0 + 10_000 });
  });

  test('restamps when the same stage gets a new end (a new check-in)', () => {
    const first = seePhase(null, WHISPER, T0);
    const next: PhaseEvent = { ...WHISPER, stageEndsAt: T0 + 90_000 };
    expect(seePhase(first, next, T0 + 80_000).seenAt).toBe(T0 + 80_000);
  });

  test('restamps when the phase changes', () => {
    const first = seePhase(null, WHISPER, T0);
    expect(seePhase(first, PHASES.monitoring, T0 + 4_000).seenAt).toBe(T0 + 4_000);
  });
});
