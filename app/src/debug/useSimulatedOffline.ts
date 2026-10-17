import { useCallback, useEffect, useRef, useState } from 'react';

import * as RaveGuard from '../../modules/raveguard-native';
import type { PhaseEvent } from '../../modules/raveguard-native';

// Swift's simulated-offline flag for the Debug panel's switch (K11). Swift changes it on its
// own (scenario 4 goes offline once its escalation is registered, Stop turns it off), so the
// switch shows the snapshot's `simulatedOffline`, re-read on mount, on every phase change
// and after every toggle, rather than remembering its own taps.

export interface SimulatedOffline {
  /** Null until the first snapshot lands. */
  isOffline: boolean | null;
  /** Sends debugSetOffline(on); rejects with the reason. Either way the snapshot is re-read. */
  setOffline: (on: boolean) => Promise<void>;
}

export function useSimulatedOffline(phase: PhaseEvent | null): SimulatedOffline {
  const [isOffline, setIsOffline] = useState<boolean | null>(null);
  // Only the newest read may land, and none after unmount.
  const latestRead = useRef(0);
  const isMounted = useRef(true);

  const refresh = useCallback(() => {
    const read = latestRead.current + 1;
    latestRead.current = read;
    RaveGuard.getSnapshot()
      .then((snapshot) => {
        if (isMounted.current && latestRead.current === read) setIsOffline(snapshot.simulatedOffline);
      })
      .catch(() => {
        // The panel already shows a failed snapshot (SessionStateProvider); keep the last value.
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [phase, refresh]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const setOffline = async (on: boolean): Promise<void> => {
    setIsOffline(on);
    try {
      await RaveGuard.debugSetOffline(on);
    } finally {
      refresh();
    }
  };

  return { isOffline, setOffline };
}
