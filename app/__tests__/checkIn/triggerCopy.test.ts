import type { CheckInTrigger } from '../../modules/raveguard-native';
import { checkInRingSize, COMPACT_RING_SIZE, COMPACT_SCREEN_HEIGHT } from '../../src/checkIn/ringSize';
import { NO_TRIGGER_LABEL, triggerCopy } from '../../src/checkIn/triggerCopy';
import { RING } from '../../src/ui';
import { FALL_TRIGGER } from '../../test-utils/nativeMock';

const AT = 1_800_000_000_000;

function trigger(kind: CheckInTrigger['kind'], reason: string): CheckInTrigger {
  return { kind, reason, at: AT };
}

describe('triggerCopy', () => {
  test('a fall: the title, the reason with a capital and a warning icon', () => {
    expect(triggerCopy(FALL_TRIGGER)).toEqual({
      title: 'Looked like a fall',
      detail: 'Spike 3.1 g, head 70° sideways, still 12 s',
      icon: 'warning',
    });
  });

  test('drops a reason that only repeats the title (Swift says "scheduled check-in")', () => {
    expect(triggerCopy(trigger('scheduled', 'scheduled check-in'))).toEqual({
      title: 'Scheduled check-in',
      detail: null,
      icon: 'clock',
    });
  });

  test('an empty reason has no detail', () => {
    expect(triggerCopy(trigger('manual', '  '))?.detail).toBeNull();
  });

  test.each([
    ['stillness', "You've been still for a while", 'warning'],
    ['manual', 'Check-in', 'info'],
  ] as const)('%s reads "%s"', (kind, title, icon) => {
    expect(triggerCopy(trigger(kind, 'no movement for 20 min'))).toMatchObject({ title, icon });
  });

  test('no trigger, no copy (and the label falls back to "Check-in")', () => {
    expect(triggerCopy(null)).toBeNull();
    expect(triggerCopy(undefined)).toBeNull();
    expect(NO_TRIGGER_LABEL).toBe('Check-in');
  });

  test('never claims a diagnosis', () => {
    const words = (['scheduled', 'fall', 'stillness', 'manual'] as const)
      .map((kind) => triggerCopy(trigger(kind, ''))?.title ?? '')
      .join(' ')
      .toLowerCase();
    expect(words).not.toMatch(/drug|unconscious|overdose|collapsed/);
  });
});

describe('checkInRingSize', () => {
  test('is the shared 240 pt ring on a normal phone', () => {
    expect(checkInRingSize(844)).toBe(RING.size);
    expect(checkInRingSize(COMPACT_SCREEN_HEIGHT)).toBe(RING.size);
  });

  test('shrinks for both stages alike on a short screen (iPhone SE), so the button stays on screen', () => {
    expect(checkInRingSize(667)).toBe(COMPACT_RING_SIZE);
    expect(COMPACT_RING_SIZE).toBeLessThan(RING.size);
  });
});
