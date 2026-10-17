import type { RecipientPermissions, Settings } from '../../modules/raveguard-native';

// Settings storage (K4): the values and limits shared by validation, editing and the store.
// The limits mirror app/modules/raveguard-native/ios/Module/ModuleSettings.swift, so anything
// saved here is accepted by configure().

/** The check-in intervals Swift accepts, in minutes. */
export const INTERVALS_MIN: readonly Settings['intervalMin'][] = [30, 60];

/** In-ear loudness target range, in dB. */
export const LOUDNESS_MIN_DB = 0;
export const LOUDNESS_MAX_DB = 120;

/** Names go into SMS briefs that must fit in 300 characters (PRD ESC-9). */
export const MAX_NAME_LENGTH = 60;
export const MAX_SELF_DESCRIPTION_LENGTH = 200;
/** The optional meeting spot goes in the alert too. */
export const MAX_MEETING_SPOT_LENGTH = 120;

/** Same as Swift's `PermissionSet()`: alerts and resolve on, location and full brief off. */
export const DEFAULT_PERMISSIONS: RecipientPermissions = {
  receiveAlerts: true,
  seeLocation: false,
  seeFullBrief: false,
  canResolve: true,
};

/**
 * What a fresh install uses until the wearer saves (the setup flow is K5): valid for
 * configure(), demo timings, nobody to text.
 */
export const DEFAULT_SETTINGS: Settings = {
  wearerName: 'Demo wearer',
  selfDescription: '',
  recipients: [],
  intervalMin: 30,
  loudnessTarget: 85,
  demo: true,
  teammatePhone: null,
  bridgeUrl: null,
  meetingSpot: '',
};
