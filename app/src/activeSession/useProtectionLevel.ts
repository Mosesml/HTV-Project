import { useEffect, useReducer, useState } from 'react';

import * as RaveGuard from '../../modules/raveguard-native';
import type { NoiseEvent } from '../../modules/raveguard-native';
import { errorMessage } from '../session/describe';
import { createLevelSender } from './levelSender';
import { INITIAL_PROTECTION, protectionReducer, sliderLevel, toProtectionLevel } from './protectionState';

// The manual protection slider (K8, PRD HRG-5): follows `onNoise`, and sends the wearer's
// level to `setProtectionLevel` one call at a time (see levelSender.ts).

export interface ProtectionLevel {
  /** What Swift last reported; null until the snapshot or the first `onNoise`. */
  noise: NoiseEvent | null;
  /** Where the slider's thumb sits. */
  sliderLevel: number;
  /** The slider's onValueChange and onSlidingComplete. */
  choose: (value: number) => void;
  error: string | null;
}

export function useProtectionLevel(): ProtectionLevel {
  const [state, dispatch] = useReducer(protectionReducer, INITIAL_PROTECTION);
  const [error, setError] = useState<string | null>(null);
  const [sender] = useState(() =>
    createLevelSender(RaveGuard.setProtectionLevel, (failure: unknown) => {
      dispatch({ type: 'failed' });
      setError(`Couldn't change protection (${errorMessage(failure)}). Try again.`);
    })
  );

  useEffect(() => {
    let isMounted = true;
    const subscription = RaveGuard.addListener('onNoise', (noise) => dispatch({ type: 'noise', noise }));
    RaveGuard.getSnapshot()
      .then((snapshot) => {
        if (isMounted) dispatch({ type: 'snapshot', noise: snapshot.noise });
      })
      .catch(() => {
        // useSessionReadings shows the failed snapshot; the level stays "—" until onNoise.
      });
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const level = sliderLevel(state);

  const choose = (value: number) => {
    const next = toProtectionLevel(value);
    if (next === level) return;
    setError(null);
    dispatch({ type: 'choose', level: next });
    sender.push(next);
  };

  return { noise: state.noise, sliderLevel: level, choose, error };
}
