import { StyleSheet, Text, View } from 'react-native';

import type { NoiseBackend, NoiseEvent } from '../../modules/raveguard-native';
import { Segmented, SPACE, TEXT, type SegmentOption } from '../ui';

// Noise control (K11, PRD D11, Debug.html): which backend Swift drives. Presentational: the
// Debug screen calls setNoiseBackend and passes back what `onNoise` reports. The background
// relay runs App Intents without opening Shortcuts; Shortcuts is the original foreground URL
// runner, chosen explicitly. The Linux bridge is cut (WORK_ORDER.md), although the module
// still accepts 'bridge'.

export const NOISE_BACKEND_CHOICES: readonly SegmentOption<NoiseBackend>[] = [
  { value: 'automation', label: 'Background relay' },
  { value: 'shortcuts', label: 'Shortcuts' },
  { value: 'off', label: 'Off' },
];

type Props = {
  /** What Swift last reported, or null before the snapshot or first `onNoise`. */
  noise: NoiseEvent | null;
  onSelect: (backend: NoiseBackend) => void;
};

function describeBackend(noise: NoiseEvent | null): string {
  if (noise === null) return 'Backend: not reported yet';
  return `Backend: ${noise.backend} · ${noise.connected ? 'connected' : 'not connected'}`;
}

export function NoiseBackendPicker({ noise, onSelect }: Props) {
  return (
    <View style={styles.group}>
      <Segmented<NoiseBackend>
        accent="blue"
        accessibilityLabel="Noise control"
        options={NOISE_BACKEND_CHOICES}
        value={noise?.backend ?? 'off'}
        onChange={onSelect}
      />
      <Text style={TEXT.small}>{describeBackend(noise)}</Text>
      {noise?.backend === 'automation' && (
        <Text style={TEXT.small}>
          Requires the RG Noise Relay automation. If it stops, protection is not confirmed. Reopen RaveGuard to restart it.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.sm },
});
