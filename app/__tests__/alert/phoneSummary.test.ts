import type { CheckInTrigger, Settings } from '../../modules/raveguard-native';
import { formatClockTime } from '../../src/alert/alertModel';
import { phoneSummary, readThisOut, SUMMARY_FOOTNOTE } from '../../src/alert/phoneSummary';

// The Alert screen's phone-side "Summary" (Kean: the mockup's "What they were sent" card is a
// summary the phone writes from what it knows) and the SOS screen's "Read this out". Neither
// may claim a diagnosis (docs/design/README.md, rule 2).

const AT_0142 = new Date(2027, 0, 9, 1, 42, 5).getTime();

type Facts = Pick<Settings, 'wearerName' | 'selfDescription' | 'meetingSpot'>;

const ALEX: Facts = {
  wearerName: 'Alex',
  selfDescription: 'Black hoodie, white cap',
  meetingSpot: 'Main stage, left side',
};

function trigger(kind: CheckInTrigger['kind']): CheckInTrigger {
  return { kind, reason: 'spike 3.1 g, head 70° sideways, still 12 s', at: AT_0142 };
}

/** Words that would claim a diagnosis or a cause. */
const DIAGNOSIS = /drug|unconscious|overdose|collapsed|injur|intoxicat|drunk|spiked|seizure|faint/i;

describe('phoneSummary', () => {
  test('a fall: what it looked like, when, the meeting spot and what the wearer has on', () => {
    expect(phoneSummary(ALEX, trigger('fall'))).toBe(
      'Alex may need help. It looked like a fall at 01:42, and Alex missed the check-in. Meeting spot: Main stage, left side. Black hoodie, white cap.'
    );
  });

  test('each kind of trigger in plain words', () => {
    expect(phoneSummary(ALEX, trigger('stillness'))).toMatch(/^Alex may need help\. Alex was still for a while before 01:42 and missed the check-in\./);
    expect(phoneSummary(ALEX, trigger('scheduled'))).toMatch(/^Alex may need help\. Alex missed a scheduled check-in at 01:42\./);
    expect(phoneSummary(ALEX, trigger('manual'))).toMatch(/^Alex may need help\. Alex missed a check-in at 01:42\./);
    expect(phoneSummary(ALEX, null)).toMatch(/^Alex may need help\. Alex missed a check-in\./);
  });

  test('uses the trigger time in local HH:MM', () => {
    expect(phoneSummary(ALEX, trigger('fall'))).toContain(formatClockTime(AT_0142));
  });

  test('leaves out what the phone does not know, without stray punctuation', () => {
    const bare: Facts = { wearerName: 'Alex', selfDescription: '  ', meetingSpot: '' };
    expect(phoneSummary(bare, trigger('scheduled'))).toBe('Alex may need help. Alex missed a scheduled check-in at 01:42.');
    expect(phoneSummary({ ...ALEX, meetingSpot: 'By the bar.', selfDescription: 'Red jacket!' }, null)).toBe(
      'Alex may need help. Alex missed a check-in. Meeting spot: By the bar. Red jacket!'
    );
  });

  test('a blank name reads as "The wearer"', () => {
    expect(phoneSummary({ ...ALEX, wearerName: ' ' }, trigger('manual'))).toMatch(/^The wearer may need help\. The wearer missed a check-in/);
  });

  test('never claims a diagnosis and never quotes the sensor numbers', () => {
    for (const kind of ['fall', 'stillness', 'scheduled', 'manual'] as const) {
      const text = phoneSummary(ALEX, trigger(kind));
      expect(text).not.toMatch(DIAGNOSIS);
      expect(text).not.toContain('3.1 g');
    }
    expect(SUMMARY_FOOTNOTE).not.toMatch(DIAGNOSIS);
  });

  test('the footnote says the phone wrote it and the texts may differ', () => {
    expect(SUMMARY_FOOTNOTE).toBe("Written on this phone. Each person's text depends on what they're allowed to see.");
  });
});

describe('readThisOut', () => {
  test('the meeting spot and the self-description, as in the mockup', () => {
    expect(readThisOut(ALEX)).toBe('Main stage, left side · Black hoodie, white cap');
  });

  test('either one alone, trimmed of a trailing full stop', () => {
    expect(readThisOut({ ...ALEX, selfDescription: '' })).toBe('Main stage, left side');
    expect(readThisOut({ ...ALEX, meetingSpot: ' ', selfDescription: 'Black hoodie, white cap.' })).toBe('Black hoodie, white cap');
  });

  test('with neither, says what to tell them', () => {
    expect(readThisOut({ ...ALEX, meetingSpot: '', selfDescription: '' })).toBe('Say your name, Alex, and where you are right now.');
    expect(readThisOut({ wearerName: '', meetingSpot: '', selfDescription: '' })).toBe('Say your name and where you are right now.');
  });
});
