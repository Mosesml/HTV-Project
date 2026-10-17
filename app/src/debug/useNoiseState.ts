import { useEffect, useState } from 'react';

import * as RaveGuard from '../../modules/raveguard-native';
import type { NoiseEvent } from '../../modules/raveguard-native';

// What Swift last reported about noise control (K11's backend picker): the snapshot on mount,
// then every `onNoise`. An event that beats the snapshot is newer, so it wins.

export function useNoiseState(): NoiseEvent | null {
  const [noise, setNoise] = useState<NoiseEvent | null>(null);

  useEffect(() => {
    let isMounted = true;
    const subscription = RaveGuard.addListener('onNoise', setNoise);
    RaveGuard.getSnapshot()
      .then((snapshot) => {
        if (isMounted) setNoise((current) => current ?? snapshot.noise);
      })
      .catch(() => {
        // The panel already shows a failed snapshot; the picker waits for onNoise.
      });
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return noise;
}
