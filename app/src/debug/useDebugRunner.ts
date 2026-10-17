import { useState } from 'react';

import { errorMessage } from '../session/describe';

// The Debug panel's one error line and one notice line (K11). Every control hands its
// module call to `run`: a rejection shows its message, success shows `notice` if given.

export type RunAction = (action: () => Promise<unknown>, notice?: string) => void;

export interface DebugRunner {
  run: RunAction;
  error: string | null;
  notice: string | null;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
}

export function useDebugRunner(): DebugRunner {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run: RunAction = (action, doneNotice) => {
    setError(null);
    setNotice(null);
    action()
      .then(() => {
        if (doneNotice !== undefined) setNotice(doneNotice);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  };

  return { run, error, notice, setError, setNotice };
}
