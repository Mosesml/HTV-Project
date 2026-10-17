import type { NoiseEvent } from '../../modules/raveguard-native';

// The manual protection slider's state (K8, PRD HRG-5). `noise` is what Swift last reported
// through `onNoise` (or the snapshot); `chosen` is the level the wearer moved the slider to
// and Swift hasn't confirmed yet. The slider shows `chosen` while there is one, so its thumb
// doesn't jump back to a lagging `onNoise` level in the middle of a drag.

export const MIN_LEVEL = 0;
export const MAX_LEVEL = 100;

export interface ProtectionState {
  noise: NoiseEvent | null;
  chosen: number | null;
}

export type ProtectionAction =
  | { type: 'snapshot'; noise: NoiseEvent }
  | { type: 'noise'; noise: NoiseEvent }
  | { type: 'choose'; level: number }
  | { type: 'failed' };

export const INITIAL_PROTECTION: ProtectionState = { noise: null, chosen: null };

/** A whole level from 0 to 100, from whatever the slider reports. */
export function toProtectionLevel(value: number): number {
  if (!Number.isFinite(value)) return MIN_LEVEL;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(value)));
}

export function protectionReducer(state: ProtectionState, action: ProtectionAction): ProtectionState {
  switch (action.type) {
    case 'snapshot':
      // An onNoise that beat the snapshot is newer, so it wins.
      return state.noise ? state : { ...state, noise: action.noise };
    case 'noise':
      return { noise: action.noise, chosen: state.chosen === action.noise.level ? null : state.chosen };
    case 'choose':
      return { ...state, chosen: action.level };
    case 'failed':
      return { ...state, chosen: null };
  }
}

/** Where the slider's thumb sits. */
export function sliderLevel(state: ProtectionState): number {
  return state.chosen ?? state.noise?.level ?? MIN_LEVEL;
}
