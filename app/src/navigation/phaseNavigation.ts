import type { PhaseEvent } from '../../modules/raveguard-native';

// Which screen the session phase sends the wearer to (K3). Pure, so every rule is unit
// tested in __tests__/navigation/phaseNavigation.test.ts; PhaseNavigator applies it.
//
// It reacts to a phase or stage *changing*, never to the phase alone: otherwise opening
// PIN entry from Alert would bounce straight back to Alert while still escalated.
//
// Duress rule (WORK_ORDER.md): after a duress PIN Swift reports `monitoring`, exactly as
// after a safe PIN, and the return to monitoring never moves the wearer off PIN entry, so
// both PINs leave the same "Cancelled. Stay safe." screen up until the wearer taps Done.

export const ROUTES = {
  setup: '/',
  session: '/session',
  checkIn: '/check-in',
  pin: '/pin',
  alert: '/alert',
  debug: '/debug',
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

export type NavigationAction =
  | { kind: 'push'; href: AppRoute }
  | { kind: 'replace'; href: AppRoute }
  | { kind: 'dismissTo'; href: AppRoute };

/** Screens the phase opens. Moving between them replaces, so Back never returns to a stale one. */
const PHASE_SCREENS: readonly string[] = [ROUTES.checkIn, ROUTES.pin, ROUTES.alert];

function screenForPhase(event: PhaseEvent): AppRoute | null {
  switch (event.phase) {
    case 'checkIn':
      // Nods and taps are ignored at the PIN gate, so it needs its own screen.
      return event.stage === 'pinGate' ? ROUTES.pin : ROUTES.checkIn;
    case 'escalated':
    case 'sos':
      return ROUTES.alert;
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
  if (previous === null && pathname === ROUTES.setup) return { kind: 'push', href: ROUTES.session };
  // PIN entry and Alert stay up: the wearer leaves them with Done or Back to session.
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

  return next.phase === 'monitoring' ? returnToMonitoring(previous, pathname) : null;
}
