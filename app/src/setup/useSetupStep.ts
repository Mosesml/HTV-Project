import { usePins } from '../pin/PinStoreProvider';
import { useSettings } from '../settings/SettingsProvider';
import { checkSetup, type SetupCheck, type SetupErrors } from './setupDraft';
import { errorsForStep, type SetupStep } from './setupSteps';
import { useSetupWizard, type SetupWizard } from './setupWizardStore';

// What one setup step screen needs: the shared draft, the check of the whole draft (live, so an
// error clears as soon as the field is fixed), and the step's own errors once its Next was pressed.

export interface SetupStepState {
  wizard: SetupWizard;
  /** Null until the draft exists. */
  check: SetupCheck | null;
  /** Every error in the draft, shown or not. */
  allErrors: SetupErrors;
  /** This step's errors, once its Next (or Finish) has been pressed. */
  errors: SetupErrors;
  hasPins: boolean;
  /** Marks the step checked; true when it has no errors and the flow may go on. */
  tryLeave(): boolean;
}

const NONE: SetupErrors = {};

export function useSetupStep(step: SetupStep): SetupStepState {
  const wizard = useSetupWizard();
  const { settings } = useSettings();
  const { hasPins } = usePins();
  const check = wizard.draft === null ? null : checkSetup(wizard.draft, settings, { hasPins });
  const allErrors = check !== null && !check.ok ? check.errors : NONE;
  const errors = wizard.checkedSteps.includes(step) ? errorsForStep(allErrors, step) : NONE;

  const tryLeave = (): boolean => {
    wizard.markChecked(step);
    return check !== null && Object.keys(errorsForStep(allErrors, step)).length === 0;
  };

  return { wizard, check, allErrors, errors, hasPins, tryLeave };
}
