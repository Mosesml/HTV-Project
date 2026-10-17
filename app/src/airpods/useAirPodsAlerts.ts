import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import * as RaveGuard from '../../modules/raveguard-native';
import { useSessionState } from '../session/SessionStateProvider';
import {
  airPodsDialog,
  DIALOG_MIN_GAP_MS,
  NO_MOTION_HINT,
  NO_MOTION_HINT_MS,
  type AirPodsDialog,
} from './airPodsAlerts';

// Tells the wearer whether RaveGuard can see their head motion (J12): a dialog when the
// AirPods connect or disconnect (`onAirPods`), and a one-time hint per session when one has
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
  /** What the wearer was last told (or the seed); a dialog shows only a change from this. */
  const told = useRef<boolean | null>(null);
  const lastDialogAt = useRef(Number.NEGATIVE_INFINITY);
  const pendingDialog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHinted = useRef(false);

  useEffect(() => {
    let isMounted = true;
    let hasHeard = false;
    /** Tells the wearer where the connection stands now, if that differs from what they know. */
    const tellCurrent = (): void => {
      if (connected.current === null) return;
      const dialog = airPodsDialog(told.current, connected.current);
      told.current = connected.current;
      if (!dialog) return;
      lastDialogAt.current = Date.now();
      show(dialog);
    };
    const subscription = RaveGuard.addListener('onAirPods', (event) => {
      hasHeard = true;
      connected.current = event.connected;
      if (event.connected && hintTimer.current) {
        clearTimeout(hintTimer.current);
        hintTimer.current = null;
      }
      if (pendingDialog.current) return; // the pending dialog will show where things ended up
      const wait = lastDialogAt.current + DIALOG_MIN_GAP_MS - Date.now();
      if (wait <= 0) {
        tellCurrent();
        return;
      }
      pendingDialog.current = setTimeout(() => {
        pendingDialog.current = null;
        tellCurrent();
      }, wait);
    });
    RaveGuard.getSnapshot()
      .then((snapshot) => {
        // An onAirPods that beat the snapshot is newer, so it wins.
        if (isMounted && !hasHeard) {
          connected.current = snapshot.airPodsConnected;
          told.current = snapshot.airPodsConnected;
        }
      })
      .catch(() => {
        // No seed: the next onAirPods says where things stand.
      });
    return () => {
      isMounted = false;
      subscription.remove();
      if (pendingDialog.current) clearTimeout(pendingDialog.current);
      pendingDialog.current = null;
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
