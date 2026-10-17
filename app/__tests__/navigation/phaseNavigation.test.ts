import { phaseNavigation, ROUTES } from '../../src/navigation/phaseNavigation';
import { PHASES } from '../../test-utils/nativeMock';

describe('phaseNavigation: entering a phase screen', () => {
  test('a check-in starting pushes Check-in over whatever is showing', () => {
    expect(phaseNavigation(PHASES.monitoring, PHASES.whisper, ROUTES.session)).toEqual({
      kind: 'push',
      href: ROUTES.checkIn,
    });
    expect(phaseNavigation(PHASES.monitoring, PHASES.whisper, ROUTES.debug)).toEqual({
      kind: 'push',
      href: ROUTES.checkIn,
    });
  });

  test('whisper to loud stays on Check-in', () => {
    expect(phaseNavigation(PHASES.whisper, PHASES.loud, ROUTES.checkIn)).toBeNull();
  });

  test('the PIN gate replaces Check-in with PIN entry', () => {
    expect(phaseNavigation(PHASES.loud, PHASES.pinGate, ROUTES.checkIn)).toEqual({
      kind: 'replace',
      href: ROUTES.pin,
    });
  });

  test.each([PHASES.escalated, PHASES.sos])('$phase replaces PIN entry with Alert', (next) => {
    expect(phaseNavigation(PHASES.pinGate, next, ROUTES.pin)).toEqual({ kind: 'replace', href: ROUTES.alert });
  });

  test('escalated to SOS stays on Alert', () => {
    expect(phaseNavigation(PHASES.escalated, PHASES.sos, ROUTES.alert)).toBeNull();
  });
});

describe('phaseNavigation: reacts to changes, not to the current state', () => {
  test('the same phase and stage again does nothing, so the wearer can open PIN entry from Alert', () => {
    expect(phaseNavigation(PHASES.escalated, PHASES.escalated, ROUTES.pin)).toBeNull();
  });

  test('a wrong PIN (still at the PIN gate) does nothing', () => {
    expect(phaseNavigation(PHASES.pinGate, PHASES.pinGate, ROUTES.pin)).toBeNull();
  });
});

describe('phaseNavigation: back to monitoring', () => {
  test('a nod or tap during the check-in returns from Check-in to the session', () => {
    expect(phaseNavigation(PHASES.loud, PHASES.monitoring, ROUTES.checkIn)).toEqual({
      kind: 'dismissTo',
      href: ROUTES.session,
    });
  });

  test('a PIN (safe or duress, which look the same) leaves the wearer on PIN entry', () => {
    expect(phaseNavigation(PHASES.pinGate, PHASES.monitoring, ROUTES.pin)).toBeNull();
    expect(phaseNavigation(PHASES.escalated, PHASES.monitoring, ROUTES.pin)).toBeNull();
  });

  test('a resolve leaves the wearer on Alert to read it', () => {
    expect(phaseNavigation(PHASES.escalated, PHASES.monitoring, ROUTES.alert)).toBeNull();
  });

  test('idle never navigates', () => {
    expect(phaseNavigation(PHASES.monitoring, PHASES.idle, ROUTES.session)).toBeNull();
  });
});

describe('phaseNavigation: first snapshot after launch', () => {
  test('a running session opens the session screen over Setup', () => {
    expect(phaseNavigation(null, PHASES.monitoring, ROUTES.setup)).toEqual({ kind: 'push', href: ROUTES.session });
  });

  test('an open check-in opens Check-in', () => {
    expect(phaseNavigation(null, PHASES.loud, ROUTES.setup)).toEqual({ kind: 'push', href: ROUTES.checkIn });
  });

  test('an idle session stays on Setup', () => {
    expect(phaseNavigation(null, PHASES.idle, ROUTES.setup)).toBeNull();
  });
});
