import { nextSessionStart } from '../../src/activeSession/sessionClock';

const STARTED = 1_800_000_000_000;
const LATER = STARTED + 60_000;

describe('nextSessionStart', () => {
  test('a running session starts the clock when none is running', () => {
    expect(nextSessionStart(null, 'monitoring', LATER)).toBe(LATER);
  });

  test('keeps the start through check-ins, alerts and SOS', () => {
    expect(nextSessionStart(STARTED, 'monitoring', LATER)).toBe(STARTED);
    expect(nextSessionStart(STARTED, 'checkIn', LATER)).toBe(STARTED);
    expect(nextSessionStart(STARTED, 'escalated', LATER)).toBe(STARTED);
    expect(nextSessionStart(STARTED, 'sos', LATER)).toBe(STARTED);
  });

  test('a stopped session clears it, so the next session counts from zero', () => {
    expect(nextSessionStart(STARTED, 'idle', LATER)).toBeNull();
    expect(nextSessionStart(null, 'idle', LATER)).toBeNull();
  });
});
