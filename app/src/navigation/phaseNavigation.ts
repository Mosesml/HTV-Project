import type { PhaseEvent } from '../../modules/raveguard-native';

// Which screen the session phase sends the wearer to (K3, redesigned for the new screen set).
// Pure, so every rule is unit tested in __tests__/navigation/phaseNavigation.test.ts;
// PhaseNavigator applies it.
//
//   idle        → Home (which shows Setup step 1 instead when nothing is saved: HomeRoute)
//   monitoring  → Active session
//   checkIn     → Check-in (whisper and loud), PIN gate (pinGate)
//   escalated   → Alert
//   sos         → SOS
//
// It reacts to a phase or stage *changing*, never to the phase alone: otherwise opening the
// PIN gate from Alert or SOS ("I'm okay now") would bounce straight back while still escalated.
//
// Duress rule (WORK_ORDER.md): after a duress PIN Swift reports `monitoring`, exactly as after
// a safe PIN, and the return to monitoring never moves the wearer off the PIN gate, so both
// PINs leave the same "Cancelling…" then "Cancelled. Stay safe." up (both drawn inside the PIN
// route, src/pin/CancelView.tsx) until the wearer taps to go back.

export const ROUTES = {
  home: '/',
  setupContacts: '/setup/contacts',
  setupPermissions: '/setup/permissions',
  setupSession: '/setup/session',
  setupPins: '/setup/pins',
  /** /setup itself: redirects to step 1 (the old one-page form's address). */
  setupLegacy: '/setup',
  session: '/session',
  checkIn: '/check-in',
  pin: '/pin',
  alert: '/alert',
  sos: '/sos',
  debug: '/debug',
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

/** The four setup steps, in order. */
export const SETUP_STEP_ROUTES = [ROUTES.setupContacts, ROUTES.setupPermissions, ROUTES.setupSession, ROUTES.setupPins] as const;

export type NavigationAction =
  | { kind: 'push'; href: AppRoute }
  | { kind: 'replace'; href: AppRoute }
  | { kind: 'dismissTo'; href: AppRoute };

/** Screens the phase opens. Moving between them replaces, so Back never returns to a stale one. */
const PHASE_SCREENS: readonly string[] = [ROUTES.checkIn, ROUTES.pin, ROUTES.alert, ROUTES.sos];

/** Where the app can be sitting with no session running: Home and setup. */
const IDLE_SCREENS: readonly string[] = [ROUTES.home, ROUTES.setupLegacy, ...SETUP_STEP_ROUTES];

export function isSetupRoute(pathname: string): boolean {
  return pathname === ROUTES.setupLegacy || (SETUP_STEP_ROUTES as readonly string[]).includes(pathname);
}

function screenForPhase(event: PhaseEvent): AppRoute | null {
  switch (event.phase) {
    case 'checkIn':
      // Nods and taps are ignored at the PIN gate, so it needs its own screen.
      return event.stage === 'pinGate' ? ROUTES.pin : ROUTES.checkIn;
    case 'escalated':
      return ROUTES.alert;
    case 'sos':
      return ROUTES.sos;
    default:
      return null;
  }
}

function isSameStep(a: PhaseEvent, b: PhaseEvent): boolean {
  return a.phase === b.phase && a.stage === b.stage;
}

function returnToMonitoring(previous: PhaseEvent | null, pathname: string): NavigationAction | null {
  // A nod or tap answered the check-in: leave Check-in for the session.
  if (pathname === ROUTES.checkIn) return { kind: 'dismissTo', href: ROUTES.session };
  // Launched (or reloaded) with a session already running.
  if (previous === null && IDLE_SCREENS.includes(pathname)) return { kind: 'push', href: ROUTES.session };
  // Start session on Home: Home doesn't navigate itself, the phase does.
  if (previous?.phase === 'idle' && pathname === ROUTES.home) return { kind: 'push', href: ROUTES.session };
  // The PIN gate, Alert and SOS stay up: the wearer leaves them with their own button.
  return null;
}

function returnToIdle(previous: PhaseEvent | null, pathname: string): NavigationAction | null {
  // The session stopped (Stop is only allowed while monitoring): back to Home.
  if (previous !== null && previous.phase !== 'idle' && pathname === ROUTES.session) {
    return { kind: 'dismissTo', href: ROUTES.home };
  }
  return null;
}

/**
 * The navigation for the wearer's phase moving from `previous` to `next` while `pathname`
 * is showing, or null to stay put. `previous` is null for the first snapshot after launch.
 */
export function phaseNavigation(
  previous: PhaseEvent | null,
  next: PhaseEvent,
  pathname: string
): NavigationAction | null {
  if (previous !== null && isSameStep(previous, next)) return null;

  const target = screenForPhase(next);
  if (target !== null) {
    if (pathname === target) return null;
    return { kind: PHASE_SCREENS.includes(pathname) ? 'replace' : 'push', href: target };
  }

  if (next.phase === 'monitoring') return returnToMonitoring(previous, pathname);
  if (next.phase === 'idle') return returnToIdle(previous, pathname);
  return null;
}
