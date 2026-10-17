import { useState } from 'react';

import { useSettings } from '../settings/SettingsProvider';
import { callFailedText } from './callCopy';
import { callTarget, startCall, type CallTarget } from './teammateCall';

export interface TeammateCall {
  target: CallTarget;
  /** Set when iOS couldn't place the last call. */
  error: string | null;
  /** Rings the teammate if Call is on; does nothing otherwise. Never runs on its own. */
  call: () => void;
}

/** Alert's and SOS's Call for help: the demo teammate only (teammateCall.ts). */
export function useTeammateCall(): TeammateCall {
  const { settings } = useSettings();
  const [error, setError] = useState<string | null>(null);
  const target = callTarget(settings);

  const call = () => {
    if (target.kind !== 'ready') return;
    setError(null);
    startCall(target).catch(() => setError(callFailedText(target.phone)));
  };

  return { target, error, call };
}
