import { useEffect, useRef, useSyncExternalStore } from 'react';

import { useSettings } from '../settings/SettingsProvider';
import { draftFromSettings, type SetupDraft } from './setupDraft';
import { withAlertsOn, type RecipientRow } from './setupRows';
import type { SetupStep } from './setupSteps';

// The draft the four setup steps edit together. The steps are sibling routes with no parent of
// their own (the route layout is shared), so the draft lives in this small store instead of a
// provider. It is made from the saved settings when the flow is entered (the first step screen
// to mount, usually step 1 from Home's Settings or a fresh install) and dropped when the last
// step screen unmounts: leaving setup, or finishing it, forgets anything unsaved. Nothing here is
// saved; SetupPinsScreen's Finish does that through checkSetup, useSettings().save and
// usePins().savePins.

export interface WizardState {
  /** Null until the settings are loaded and the flow has started. */
  draft: SetupDraft | null;
  /** True when the draft was made from saved settings (Settings on Home), false on a fresh install. */
  isEditing: boolean;
  /** Steps whose Next (or Finish) was pressed: only these show their errors. */
  checkedSteps: readonly SetupStep[];
}

const EMPTY: WizardState = { draft: null, isEditing: false, checkedSteps: [] };

let state: WizardState = EMPTY;
let openScreens = 0;
/** Set while one step screen replaces another, which may unmount the old one first. */
let isHandingOver = false;
const listeners = new Set<() => void>();

function setState(next: WizardState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getState(): WizardState {
  return state;
}

/** Applies a change to the draft; a no-op before the draft exists. */
function updateDraft(change: (draft: SetupDraft) => SetupDraft): void {
  if (state.draft === null) return;
  setState({ ...state, draft: change(state.draft) });
}

/**
 * Keeps the draft while the next navigation replaces the only open step screen with another
 * (Finish's "Go to step 1" when step 1 isn't under it), which isn't leaving setup.
 */
export function keepDraftThroughNavigation(): void {
  isHandingOver = true;
}

export interface SetupWizard extends WizardState {
  change(changes: Partial<SetupDraft>): void;
  changeRows(edit: (rows: readonly RecipientRow[]) => readonly RecipientRow[]): void;
  /** Marks a step as checked, so it shows its errors from now on. */
  markChecked(step: SetupStep): void;
}

/** The shared draft, for one setup step screen. */
export function useSetupWizard(): SetupWizard {
  const { settings, source, isLoaded } = useSettings();
  const current = useSyncExternalStore(subscribe, getState, getState);
  const hasStarted = useRef(false);

  useEffect(() => {
    openScreens += 1;
    isHandingOver = false;
    return () => {
      openScreens -= 1;
      if (openScreens > 0) return;
      if (isHandingOver) {
        isHandingOver = false;
        return;
      }
      setState(EMPTY);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || hasStarted.current) return;
    hasStarted.current = true;
    if (state.draft !== null) return;
    const isEditing = source === 'saved';
    const draft = draftFromSettings(settings, { isSaved: isEditing });
    setState({ draft: { ...draft, recipients: withAlertsOn(draft.recipients) }, isEditing, checkedSteps: [] });
  }, [isLoaded, settings, source]);

  return {
    ...current,
    change: (changes) => updateDraft((draft) => ({ ...draft, ...changes })),
    changeRows: (edit) => updateDraft((draft) => ({ ...draft, recipients: edit(draft.recipients) })),
    markChecked: (step) => {
      if (!state.checkedSteps.includes(step)) setState({ ...state, checkedSteps: [...state.checkedSteps, step] });
    },
  };
}
