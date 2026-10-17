// Latest-wins sending for the protection slider (K8). A drag reports every step, and each
// `setProtectionLevel` makes Swift emit `onNoise` (and, with Shortcuts, may switch the
// AirPods). So one call is in flight at a time; levels pushed meanwhile collapse into the
// newest, which goes as soon as the call in flight settles. A drag therefore always ends on
// its final level. VoiceOver's swipe up and down only report value changes, never a
// release, which is why the slider sends on change rather than on release.

export interface LevelSender {
  push(level: number): void;
}

/** Calls `send` now; a send that throws synchronously becomes a rejected promise. */
function startSend(send: (level: number) => Promise<void>, level: number): Promise<void> {
  try {
    return send(level);
  } catch (error: unknown) {
    return Promise.reject(error);
  }
}

export function createLevelSender(
  send: (level: number) => Promise<void>,
  onError: (error: unknown, level: number) => void
): LevelSender {
  let inFlight: number | null = null;
  let queued: number | null = null;

  const run = (level: number): void => {
    inFlight = level;
    startSend(send, level)
      .catch((error: unknown) => onError(error, level))
      .finally(() => {
        const next = queued;
        inFlight = null;
        queued = null;
        if (next !== null && next !== level) run(next);
      });
  };

  return {
    push(level) {
      if (inFlight === null) {
        run(level);
      } else {
        queued = level;
      }
    },
  };
}
