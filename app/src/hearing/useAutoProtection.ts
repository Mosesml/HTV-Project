import { useCallback, useEffect, useRef, useState } from 'react';

import * as RaveGuard from '../../modules/raveguard-native';
import type { HearingEvent } from '../../modules/raveguard-native';
import { errorMessage } from '../session/describe';
import { summarizeHearing, type HearingSummary } from './hearingModel';

// Automatic protection (backlog BL1) for a screen: the mode, room level and dose that
// `onHearing` reports, and `setAuto` to hand protection to Swift's level loop or back to the
// slider. The slider itself stays in useProtectionLevel, which already follows the loop's
// level through `onNoise`; moving it switches to manual in Swift.

export interface AutoProtection extends HearingSummary {
  /** Null until the snapshot or the first `onHearing`. */
  hearing: HearingEvent | null;
  /** True while a mode change is on its way to Swift. */
  isSwitching: boolean;
  setAuto: (on: boolean) => void;
  error: string | null;
}

export function useAutoProtection(): AutoProtection {
  const [hearing, setHearing] = useState<HearingEvent | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const subscription = RaveGuard.addListener('onHearing', setHearing);
    RaveGuard.getSnapshot()
      .then((snapshot) => {
        // An onHearing that beat the snapshot is newer, so it wins.
        if (isMounted.current) setHearing((current) => current ?? snapshot.hearing);
      })
      .catch((failure: unknown) => {
        if (isMounted.current) setError(`Couldn't read protection (${errorMessage(failure)}).`);
      });
    return () => {
      isMounted.current = false;
      subscription.remove();
    };
  }, []);

  // Swift answers a change with `onHearing`, so the mode shown is always the one in force.
  const setAuto = useCallback((on: boolean) => {
    const mode = on ? 'auto' : 'manual';
    setError(null);
    setIsSwitching(true);
    RaveGuard.setProtectionMode(mode)
      .catch((failure: unknown) => {
        if (isMounted.current) {
          setError(`Couldn't switch to ${on ? 'automatic' : 'manual'} protection (${errorMessage(failure)}). Try again.`);
        }
      })
      .finally(() => {
        if (isMounted.current) setIsSwitching(false);
      });
  }, []);

  return { ...summarizeHearing(hearing), hearing, isSwitching, setAuto, error };
}
