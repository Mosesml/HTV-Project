import { isSetupRoute, phaseNavigation, ROUTES, SETUP_STEP_ROUTES } from '../../src/navigation/phaseNavigation';
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

  test('the PIN gate replaces Check-in', () => {
    expect(phaseNavigation(PHASES.loud, PHASES.pinGate, ROUTES.checkIn)).toEqual({
      kind: 'replace',
      href: ROUTES.pin,
    });
  });

  test('escalated replaces the PIN gate with Alert', () => {
    expect(phaseNavigation(PHASES.pinGate, PHASES.escalated, ROUTES.pin)).toEqual({ kind: 'replace', href: ROUTES.alert });
  });

  test('SOS replaces the PIN gate or Alert with the SOS screen', () => {
    expect(phaseNavigation(PHASES.pinGate, PHASES.sos, ROUTES.pin)).toEqual({ kind: 'replace', href: ROUTES.sos });
    expect(phaseNavigation(PHASES.escalated, PHASES.sos, ROUTES.alert)).toEqual({ kind: 'replace', href: ROUTES.sos });
  });

  test('SOS arriving while the wearer is elsewhere pushes it', () => {
    expect(phaseNavigation(PHASES.escalated, PHASES.sos, ROUTES.debug)).toEqual({ kind: 'push', href: ROUTES.sos });
  });

  test('SOS again on the SOS screen stays put', () => {
    expect(phaseNavigation(null, PHASES.sos, ROUTES.sos)).toBeNull();
  });
});

describe('phaseNavigation: reacts to changes, not to the current state', () => {
  test('the same phase and stage again does nothing, so "I\'m okay now" can open the PIN gate from Alert', () => {
    expect(phaseNavigation(PHASES.escalated, PHASES.escalated, ROUTES.pin)).toBeNull();
  });

  test('…and from SOS', () => {
    expect(phaseNavigation(PHASES.sos, PHASES.sos, ROUTES.pin)).toBeNull();
  });

  test('a wrong PIN (still at the PIN gate) does nothing', () => {
    expect(phaseNavigation(PHASES.pinGate, PHASES.pinGate, ROUTES.pin)).toBeNull();
  });

  test('a new trigger on the same step does nothing: only phase and stage count', () => {
    expect(phaseNavigation(PHASES.whisper, { ...PHASES.whisper, trigger: null }, ROUTES.checkIn)).toBeNull();
  });
});

describe('phaseNavigation: back to monitoring', () => {
  test('a nod or tap during the check-in returns from Check-in to the session', () => {
    expect(phaseNavigation(PHASES.loud, PHASES.monitoring, ROUTES.checkIn)).toEqual({
      kind: 'dismissTo',
      href: ROUTES.session,
    });
  });

  test('a PIN (safe or duress, which look the same) leaves the wearer on the PIN gate', () => {
    expect(phaseNavigation(PHASES.pinGate, PHASES.monitoring, ROUTES.pin)).toBeNull();
    expect(phaseNavigation(PHASES.escalated, PHASES.monitoring, ROUTES.pin)).toBeNull();
    expect(phaseNavigation(PHASES.sos, PHASES.monitoring, ROUTES.pin)).toBeNull();
  });

  test('a resolve leaves the wearer on Alert or SOS to read it', () => {
    expect(phaseNavigation(PHASES.escalated, PHASES.monitoring, ROUTES.alert)).toBeNull();
    expect(phaseNavigation(PHASES.sos, PHASES.monitoring, ROUTES.sos)).toBeNull();
  });

  test('Start session on Home opens Active session when Swift reports monitoring', () => {
    expect(phaseNavigation(PHASES.idle, PHASES.monitoring, ROUTES.home)).toEqual({ kind: 'push', href: ROUTES.session });
  });

  test('a session started from Debug stays on Debug', () => {
    expect(phaseNavigation(PHASES.idle, PHASES.monitoring, ROUTES.debug)).toBeNull();
  });
});

describe('phaseNavigation: back to idle', () => {
  test('a stopped session returns from Active session to Home', () => {
    expect(phaseNavigation(PHASES.monitoring, PHASES.idle, ROUTES.session)).toEqual({ kind: 'dismissTo', href: ROUTES.home });
  });

  test('idle anywhere else stays put (Debug, Home, setup)', () => {
    expect(phaseNavigation(PHASES.monitoring, PHASES.idle, ROUTES.debug)).toBeNull();
    expect(phaseNavigation(PHASES.monitoring, PHASES.idle, ROUTES.home)).toBeNull();
    expect(phaseNavigation(null, PHASES.idle, ROUTES.session)).toBeNull();
  });
});

describe('phaseNavigation: first snapshot after launch', () => {
  test('a running session opens the session screen over Home or setup', () => {
    expect(phaseNavigation(null, PHASES.monitoring, ROUTES.home)).toEqual({ kind: 'push', href: ROUTES.session });
    expect(phaseNavigation(null, PHASES.monitoring, ROUTES.setupContacts)).toEqual({ kind: 'push', href: ROUTES.session });
    expect(phaseNavigation(null, PHASES.monitoring, ROUTES.setupLegacy)).toEqual({ kind: 'push', href: ROUTES.session });
  });

  test('an open check-in opens Check-in', () => {
    expect(phaseNavigation(null, PHASES.loud, ROUTES.home)).toEqual({ kind: 'push', href: ROUTES.checkIn });
  });

  test('an idle session stays on Home', () => {
    expect(phaseNavigation(null, PHASES.idle, ROUTES.home)).toBeNull();
  });
});

describe('routes', () => {
  test('the four setup steps, in order, all count as setup', () => {
    expect(SETUP_STEP_ROUTES).toEqual(['/setup/contacts', '/setup/permissions', '/setup/session', '/setup/pins']);
    expect(SETUP_STEP_ROUTES.every(isSetupRoute)).toBe(true);
    expect(isSetupRoute(ROUTES.setupLegacy)).toBe(true);
    expect(isSetupRoute(ROUTES.session)).toBe(false);
  });
});
