import { DEFAULT_PERMISSIONS } from '../../src/settings/defaults';
import { airPodsStatus, alertChain, hearingStatus } from '../../src/setup/homeStatus';
import {
  clockTime,
  leastTrusted,
  PERMISSION_LINES,
  previewBrief,
  shortName,
  spokenNames,
} from '../../src/setup/permissionPreview';
import { appendDigit, differentCheck, entryProblem, pinCardState, pinFieldError } from '../../src/setup/pinStep';
import { FIRST_CONTACT_PERMISSIONS, VENUE_STAFF_PERMISSIONS } from '../../src/setup/setupRows';
import { dragTargetIndex, errorsForStep, firstStepToFix, stepOfErrorKey } from '../../src/setup/setupSteps';

// The pure helpers behind the redesigned setup steps and Home.

describe('setup steps', () => {
  test('each field belongs to the step that shows it', () => {
    expect(stepOfErrorKey('wearerName')).toBe(1);
    expect(stepOfErrorKey('recipients')).toBe(1);
    expect(stepOfErrorKey('recipient:abc:phone')).toBe(1);
    expect(stepOfErrorKey('selfDescription')).toBe(3);
    expect(stepOfErrorKey('meetingSpot')).toBe(3);
    expect(stepOfErrorKey('loudnessTarget')).toBe(3);
    expect(stepOfErrorKey('safePin')).toBe(4);
    expect(stepOfErrorKey('duressPin')).toBe(4);
    expect(stepOfErrorKey('form')).toBe(4);
  });

  test('a step sees only its own errors', () => {
    const errors = { wearerName: 'Enter your name', safePin: 'Enter 4 to 8 digits', meetingSpot: 'Too long' };
    expect(errorsForStep(errors, 1)).toEqual({ wearerName: 'Enter your name' });
    expect(errorsForStep(errors, 2)).toEqual({});
    expect(errorsForStep(errors, 3)).toEqual({ meetingSpot: 'Too long' });
    expect(errorsForStep(errors, 4)).toEqual({ safePin: 'Enter 4 to 8 digits' });
  });

  test('the earliest step with an error is the one to fix first', () => {
    expect(firstStepToFix({ safePin: 'a', meetingSpot: 'b', 'recipient:x:name': 'Enter a name' })).toEqual({
      step: 1,
      message: 'Enter a name',
    });
    expect(firstStepToFix({})).toBeNull();
  });

  test('a drag moves one place per row, clamped to the list', () => {
    expect(dragTargetIndex(0, 0, 70, 3)).toBe(0);
    expect(dragTargetIndex(0, 30, 70, 3)).toBe(0);
    expect(dragTargetIndex(0, 40, 70, 3)).toBe(1);
    expect(dragTargetIndex(0, 150, 70, 3)).toBe(2);
    expect(dragTargetIndex(2, -150, 70, 3)).toBe(0);
    expect(dragTargetIndex(1, 900, 70, 3)).toBe(2);
    expect(dragTargetIndex(1, 100, 0, 3)).toBe(1);
    expect(dragTargetIndex(0, 100, 70, 0)).toBe(0);
  });
});

describe('permissions step', () => {
  const maya = { name: 'Maya Chen', kind: 'contact' as const, permissions: FIRST_CONTACT_PERMISSIONS };
  const theo = { name: 'Theo Park', kind: 'contact' as const, permissions: DEFAULT_PERMISSIONS };
  const venue = { name: 'Main stage medical', kind: 'venueStaff' as const, permissions: VENUE_STAFF_PERMISSIONS };

  test('lists the four permissions with Get alerts locked on', () => {
    expect(PERMISSION_LINES.map((line) => [line.key, line.title, line.isLocked])).toEqual([
      ['receiveAlerts', 'Get alerts', true],
      ['seeLocation', 'See location', false],
      ['seeFullBrief', 'Full details', false],
      ['canResolve', 'Mark resolved', false],
    ]);
  });

  test('names columns by first name, venue staff as Venue', () => {
    expect([maya, theo, venue].map(shortName)).toEqual(['Maya', 'Theo', 'Venue']);
    expect(spokenNames([maya, theo, venue])).toEqual(['Maya', 'Theo', 'Venue staff']);
  });

  test('spoken names stay unique', () => {
    expect(spokenNames([maya, { ...maya, name: 'Maya Lee' }, venue, venue])).toEqual([
      'Maya 1',
      'Maya 2',
      'Venue staff 3',
      'Venue staff 4',
    ]);
  });

  test('previews the recipient who gets the least, the earliest on a tie', () => {
    expect(leastTrusted([maya, theo, venue])).toBe(theo);
    expect(leastTrusted([maya, venue])).toBe(venue);
    expect(leastTrusted([maya, { ...maya }])).toBe(maya);
    expect(leastTrusted([])).toBeNull();
  });

  test('the preview says what the alert carries, never a diagnosis', () => {
    const at = new Date(2026, 9, 17, 1, 44).getTime();
    expect(clockTime(at)).toBe('01:44');
    expect(previewBrief('Alex', DEFAULT_PERMISSIONS, at)).toEqual({
      quote: '"Alex missed a safety check-in at 01:44."',
      extra: 'No location, no details.',
    });
    expect(previewBrief('Alex', VENUE_STAFF_PERMISSIONS, at).extra).toBe('With your location, no other details.');
    expect(previewBrief('Alex', { seeLocation: false, seeFullBrief: true }, at).extra).toBe('With the full details, no location.');
    expect(previewBrief('Alex', FIRST_CONTACT_PERMISSIONS, at).extra).toBe('With your location and the full details.');
    expect(previewBrief('  ', DEFAULT_PERMISSIONS, at).quote).toBe('"You missed a safety check-in at 01:44."');
  });
});

describe('PIN step', () => {
  test('a card shows a new PIN by its length, a stored one as set, otherwise not set', () => {
    expect(pinCardState('safePin', '246813', false)).toEqual({ isSet: true, filled: 6, label: 'Safe PIN set, 6 digits' });
    expect(pinCardState('duressPin', '', true)).toEqual({ isSet: true, filled: 4, label: 'Duress PIN set' });
    expect(pinCardState('duressPin', '', false)).toEqual({ isSet: false, filled: 0, label: 'Duress PIN not set' });
  });

  test('"The two PINs are different" is checked against the draft, or trusts the stored pair', () => {
    expect(differentCheck({ safePin: '2468', duressPin: '1357' }, false)).toBe('ok');
    expect(differentCheck({ safePin: '2468', duressPin: '2468' }, false)).toBe('same');
    expect(differentCheck({ safePin: '2468', duressPin: '' }, false)).toBe('pending');
    expect(differentCheck({ safePin: '', duressPin: '' }, false)).toBe('pending');
    expect(differentCheck({ safePin: '', duressPin: '' }, true)).toBe('ok');
    expect(differentCheck({ safePin: '8642', duressPin: '' }, true)).toBe('pending');
  });

  test('a card error explains that stored PINs change together', () => {
    const errors = { duressPin: 'Enter 4 to 8 digits' };
    expect(pinFieldError('duressPin', errors, { safePin: '8642', duressPin: '' }, true)).toBe('Change both PINs together');
    expect(pinFieldError('duressPin', errors, { safePin: '8642', duressPin: '' }, false)).toBe('Enter 4 to 8 digits');
    expect(pinFieldError('safePin', errors, { safePin: '8642', duressPin: '' }, true)).toBeUndefined();
  });

  test('the entry takes at most 8 digits and must be 4 or more, unlike the other PIN', () => {
    expect(appendDigit('1234567', '8')).toBe('12345678');
    expect(appendDigit('12345678', '9')).toBe('12345678');
    expect(entryProblem('safePin', '123', '')).toBe('Enter 4 to 8 digits');
    expect(entryProblem('duressPin', '2468', '2468')).toBe('Must be different from your safe PIN');
    expect(entryProblem('safePin', '2468', '2468')).toBe('Must be different from your duress PIN');
    expect(entryProblem('safePin', '2468', '')).toBeNull();
  });
});

describe('Home status rows', () => {
  test('AirPods: unknown until the session starts, then connected or not', () => {
    expect(airPodsStatus(null)).toMatchObject({ text: 'Checked when the session starts', dot: null });
    expect(airPodsStatus(true)).toMatchObject({ text: 'Connected · head motion streaming', dot: 'ok' });
    expect(airPodsStatus(false)).toMatchObject({ text: 'Not connected', dot: 'off' });
  });

  test('hearing protection: "—" (spoken "no reading yet") until onNoise, then the backend', () => {
    expect(hearingStatus(null)).toEqual({ text: '—', spoken: 'no reading yet', dot: null });
    expect(hearingStatus({ backend: 'bridge', connected: true, level: 2 })).toMatchObject({ text: 'Bridge · connected', dot: 'ok' });
    expect(hearingStatus({ backend: 'shortcuts', connected: false, level: 0 })).toMatchObject({
      text: 'Shortcuts · not connected',
      dot: 'off',
    });
    expect(hearingStatus({ backend: 'off', connected: false, level: 0 })).toMatchObject({ text: 'Off', dot: 'off' });
    expect(hearingStatus({ backend: 'automation', connected: true, level: 70 })).toMatchObject({
      text: 'Background relay · connected',
      dot: 'ok',
    });
  });

  test('the alert chain uses first names and calls venue staff what they are', () => {
    expect(
      alertChain([
        { name: 'Maya Chen', kind: 'contact' },
        { name: 'Theo Park', kind: 'contact' },
        { name: 'Main stage medical', kind: 'venueStaff' },
      ])
    ).toBe('Maya → Theo → Venue staff');
    expect(alertChain([])).toBe('Nobody yet');
  });
});
