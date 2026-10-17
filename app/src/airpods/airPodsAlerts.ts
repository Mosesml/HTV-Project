// The dialogs that say whether RaveGuard can see the wearer's head motion (J12): one when the
// AirPods connect or disconnect (`onAirPods`), and a hint when a session has run for a while
// without them. Pure, so the rules are tested without React.

export interface AirPodsDialog {
  title: string;
  message: string;
}

export const AIRPODS_CONNECTED: AirPodsDialog = {
  title: 'AirPods connected',
  message: 'Head motion is live. Open Debug to watch it.',
};

export const AIRPODS_DISCONNECTED: AirPodsDialog = {
  title: 'AirPods disconnected',
  message: "RaveGuard can't see your head motion until they're back in.",
};

/** Ignore brief motion-service reconnects before showing a connection dialog. */
export const CONNECTION_SETTLE_MS = 1500;

/** How long a session runs without connected AirPods before the hint shows. */
export const NO_MOTION_HINT_MS = 10_000;

export const NO_MOTION_HINT: AirPodsDialog = {
  title: 'No AirPods motion yet',
  message:
    'Put both AirPods in. If they are in, check Settings → Privacy & Security → Motion & Fitness → RaveGuard is on.',
};

/**
 * The dialog for a change from `previous` (null until known) to `connected`, or null when
 * nothing changed. A first "disconnected" shows nothing: they were never known to be in, and
 * the no-motion hint covers that.
 */
export function airPodsDialog(previous: boolean | null, connected: boolean): AirPodsDialog | null {
  if (connected) return previous === true ? null : AIRPODS_CONNECTED;
  return previous === true ? AIRPODS_DISCONNECTED : null;
}
