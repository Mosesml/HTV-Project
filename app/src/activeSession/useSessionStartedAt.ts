import { useEffect, useState } from 'react';

import * as RaveGuard from '../../modules/raveguard-native';
import { nextSessionStart } from './sessionClock';

/**
 * Epoch ms when the session started, as far as the app can tell: the Active session screen
 * mounts as the session starts (`monitoring`) and stays mounted under Check-in, the PIN gate,
 * Alert, SOS and Debug, so it counts from its mount, through every check-in, and clears when
 * Swift reports `idle`. After an app relaunch mid-session it counts from the relaunch.
 */
export function useSessionStartedAt(): number | null {
  const [startedAt, setStartedAt] = useState<number | null>(() => Date.now());

  useEffect(() => {
    const subscription = RaveGuard.addListener('onPhase', (event) =>
      setStartedAt((current) => nextSessionStart(current, event.phase, Date.now()))
    );
    return () => subscription.remove();
  }, []);

  return startedAt;
}
