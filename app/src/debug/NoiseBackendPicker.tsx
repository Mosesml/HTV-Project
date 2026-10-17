import { StyleSheet, Text, View } from 'react-native';

import type { NoiseBackend, NoiseEvent } from '../../modules/raveguard-native';
import { Segmented, SPACE, TEXT, type SegmentOption } from '../ui';

// Noise control (K11, PRD D11, Debug.html): which backend Swift drives. Presentational: the
// Debug screen calls setNoiseBackend and passes back what `onNoise` reports. All three of the
// module's backends are offered, as the mockup draws them; the Linux bridge itself is cut
// (WORK_ORDER.md), so the line under the segments says whether Swift reports it connected.

export const NOISE_BACKEND_CHOICES: readonly SegmentOption<NoiseBackend>[] = [
  { value: 'bridge', label: 'Bridge' },
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
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.sm },
});
