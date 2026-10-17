import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import * as RaveGuard from '../../modules/raveguard-native';
import { useSessionState } from '../session/SessionStateProvider';
import { airPodsDialog, CONNECTION_SETTLE_MS, NO_MOTION_HINT, NO_MOTION_HINT_MS, type AirPodsDialog } from './airPodsAlerts';

// Tells the wearer whether RaveGuard can see their head motion (J12): a dialog when the
// AirPods connection change (`onAirPods`) stays stable briefly, and a one-time hint when one has
// run NO_MOTION_HINT_MS without them. The snapshot seeds what is known without a dialog, so a
// relaunch mid-session with the AirPods already in shows nothing. Everything lives in refs:
// none of it is drawn, so nothing re-renders.

function show(dialog: AirPodsDialog): void {
  Alert.alert(dialog.title, dialog.message);
}

export function useAirPodsAlerts(): void {
  const { phase } = useSessionState();
  const isSessionRunning = phase !== null && phase.phase !== 'idle';
  /** Null until the snapshot or the first `onAirPods`. */
  const connected = useRef<boolean | null>(null);
  const settledConnected = useRef<boolean | null>(null);
  const connectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHinted = useRef(false);

  useEffect(() => {
    let isMounted = true;
    let hasHeard = false;
    const subscription = RaveGuard.addListener('onAirPods', (event) => {
      hasHeard = true;
      if (connected.current === event.connected) return;
      connected.current = event.connected;
      if (event.connected && hintTimer.current) {
        clearTimeout(hintTimer.current);
        hintTimer.current = null;
      }
      if (connectionTimer.current !== null) {
        clearTimeout(connectionTimer.current);
        connectionTimer.current = null;
      }
      if (event.connected === settledConnected.current) return;
      connectionTimer.current = setTimeout(() => {
        connectionTimer.current = null;
        const next = connected.current;
        if (next === null) return;
        const dialog = airPodsDialog(settledConnected.current, next);
        settledConnected.current = next;
        if (dialog) show(dialog);
      }, CONNECTION_SETTLE_MS);
    });
    RaveGuard.getSnapshot()
      .then((snapshot) => {
        // An onAirPods that beat the snapshot is newer, so it wins.
        if (isMounted && !hasHeard) {
          connected.current = snapshot.airPodsConnected;
          settledConnected.current = snapshot.airPodsConnected;
        }
      })
      .catch(() => {
        // No seed: the next onAirPods says where things stand.
      });
    return () => {
      isMounted = false;
      subscription.remove();
      if (connectionTimer.current !== null) {
        clearTimeout(connectionTimer.current);
        connectionTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isSessionRunning) {
      hasHinted.current = false;
      return;
    }
    if (connected.current === true || hasHinted.current) return;
    const timer = setTimeout(() => {
      hintTimer.current = null;
      if (connected.current === true) return;
      hasHinted.current = true;
      show(NO_MOTION_HINT);
    }, NO_MOTION_HINT_MS);
    hintTimer.current = timer;
    return () => {
      clearTimeout(timer);
      hintTimer.current = null;
    };
  }, [isSessionRunning]);
}
