import { describeTrigger } from '../../src/session/describe';
import { FALL_TRIGGER } from '../../test-utils/nativeMock';

describe('describeTrigger', () => {
  test('a fall: a title that claims no diagnosis, and the reason with a capital', () => {
    expect(describeTrigger(FALL_TRIGGER)).toEqual({
      title: 'Looked like a fall',
      detail: 'Spike 3.1 g, head 70° sideways, still 12 s',
    });
  });

  test.each([
    ['scheduled', 'Scheduled check-in'],
    ['stillness', "You've been still for a while"],
    ['manual', 'Check-in'],
  ] as const)('%s', (kind, title) => {
    expect(describeTrigger({ kind, reason: 'x', at: 0 })?.title).toBe(title);
  });

  test('no trigger, no description; an empty reason gives an empty detail', () => {
    expect(describeTrigger(null)).toBeNull();
    expect(describeTrigger(undefined)).toBeNull();
    expect(describeTrigger({ kind: 'fall', reason: '  ', at: 0 })).toEqual({ title: 'Looked like a fall', detail: '' });
  });
});
