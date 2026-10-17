import type { Settings } from '../../modules/raveguard-native';

/**
 * What Setup and Debug send through `configure()` until settings storage (K4) and the setup
 * flow (K5) exist. Demo timings, no recipients, no teammate number.
 */
export const PLACEHOLDER_SETTINGS: Settings = {
  wearerName: 'Demo wearer',
  selfDescription: 'Placeholder until setup (K5)',
  recipients: [],
  intervalMin: 30,
  loudnessTarget: 85,
  demo: true,
  teammatePhone: null,
  bridgeUrl: null,
};
