import { useEffect, useRef, useState } from 'react';

import { CANCELLING_MS, type CancelKind, type CancelStep } from './cancelSequence';
import { playCancelHaptic, sendPinResult } from './pinFeedback';

export interface CancelSequence {
  step: CancelStep;
  /** Starts the cancel for a correct PIN. Only the first call counts. */
  startCancel: (kind: CancelKind) => void;
}

/**
 * The one code path for the safe and the duress PIN (K9). The kind is handed to
 * `sendPinResult` and never kept, so nothing rendered can depend on it: both PINs get the
 * same haptic, "Cancelling…" for exactly `CANCELLING_MS`, then "Cancelled. Stay safe.".
 */
export function useCancelSequence(): CancelSequence {
  const [step, setStep] = useState<CancelStep>('entering');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStartedRef = useRef(false);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    []
  );

  const startCancel = (kind: CancelKind) => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    sendPinResult(kind);
    playCancelHaptic();
    setStep('cancelling');
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setStep('cancelled');
    }, CANCELLING_MS);
  };

  return { step, startCancel };
}
