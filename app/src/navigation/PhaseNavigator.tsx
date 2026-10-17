import { useEffect, useEffectEvent, useRef } from 'react';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';

import type { PhaseEvent } from '../../modules/raveguard-native';
import { useSessionState } from '../session/SessionStateProvider';
import { phaseNavigation, type NavigationAction } from './phaseNavigation';

type Router = ReturnType<typeof useRouter>;

function apply(router: Router, action: NavigationAction): void {
  switch (action.kind) {
    case 'push':
      router.push(action.href);
      return;
    case 'replace':
      router.replace(action.href);
      return;
    case 'dismissTo':
      router.dismissTo(action.href);
      return;
  }
}

/** Moves the wearer to the screen their session phase calls for (see phaseNavigation.ts). Renders nothing. */
export function PhaseNavigator() {
  const { phase } = useSessionState();
  const pathname = usePathname();
  const router = useRouter();
  const isNavigationReady = Boolean(useRootNavigationState()?.key);
  const previous = useRef<PhaseEvent | null>(null);

  // Reads the latest pathname without making a route change re-run the phase logic.
  const handlePhase = useEffectEvent((next: PhaseEvent) => {
    const action = phaseNavigation(previous.current, next, pathname);
    previous.current = next;
    if (action) apply(router, action);
  });

  useEffect(() => {
    if (phase && isNavigationReady) handlePhase(phase);
  }, [phase, isNavigationReady]);

  return null;
}
