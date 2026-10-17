import { ROUTES } from '../navigation/phaseNavigation';
import type { SetupErrors } from './setupDraft';

// Which of the four setup steps owns each field (docs/design/screens/Setup-*.html), so a step's
// Next checks only its own fields and Finish can point at the step that still needs a fix.
// Pure.

export type SetupStep = 1 | 2 | 3 | 4;

export const SETUP_STEP_HREFS: Readonly<Record<SetupStep, string>> = {
  1: ROUTES.setupContacts,
  2: ROUTES.setupPermissions,
  3: ROUTES.setupSession,
  4: ROUTES.setupPins,
};

export const SETUP_STEP_NAMES: Readonly<Record<SetupStep, string>> = {
  1: 'Who gets the alert?',
  2: 'What each person sees',
  3: 'Your night',
  4: 'Two PINs',
};

const STEP_BY_KEY: Readonly<Record<string, SetupStep>> = {
  wearerName: 1,
  recipients: 1,
  selfDescription: 3,
  meetingSpot: 3,
  loudnessTarget: 3,
  safePin: 4,
  duressPin: 4,
};

/** The step that shows the error with this key; anything unknown ("form") is shown on the last step. */
export function stepOfErrorKey(key: string): SetupStep {
  if (key.startsWith('recipient:')) return 1;
  return STEP_BY_KEY[key] ?? 4;
}

/** The errors one step shows. */
export function errorsForStep(errors: SetupErrors, step: SetupStep): SetupErrors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => stepOfErrorKey(key) === step));
}

/** The earliest step with an error, and that error's message; null when there is none. */
export function firstStepToFix(errors: SetupErrors): { step: SetupStep; message: string } | null {
  return Object.entries(errors).reduce<{ step: SetupStep; message: string } | null>((first, [key, message]) => {
    const step = stepOfErrorKey(key);
    return first === null || step < first.step ? { step, message } : first;
  }, null);
}

/** Where a drag of `distance` points from row `from` lands, with rows `rowStep` points apart. */
export function dragTargetIndex(from: number, distance: number, rowStep: number, count: number): number {
  if (count <= 0) return 0;
  const moved = rowStep > 0 ? Math.round(distance / rowStep) : 0;
  return Math.min(Math.max(0, from + moved), count - 1);
}
