import { StyleSheet, Text, View } from 'react-native';

import type { NoiseBackend, NoiseEvent } from '../../modules/raveguard-native';
import { ChoiceChips, type Choice } from '../ui/ChoiceChips';
import { TYPE } from '../ui/theme';

// The noise backend picker (K11, PRD D11). Presentational: the Debug screen calls
// setNoiseBackend and passes back what `onNoise` reports. The relay uses background App
// Intents; Shortcuts is the original foreground URL runner, chosen explicitly.
// The Linux bridge is cut (WORK_ORDER.md, PRD), although the module still accepts 'bridge'.

export const NOISE_BACKEND_CHOICES: readonly Choice<NoiseBackend>[] = [
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
      <ChoiceChips choices={NOISE_BACKEND_CHOICES} selected={noise?.backend ?? 'off'} onSelect={onSelect} />
      <Text style={TYPE.label}>{describeBackend(noise)}</Text>
      {noise?.backend === 'automation' && (
        <Text style={TYPE.label}>
          Requires the RG Noise Relay automation. If it stops, protection is not confirmed. Reopen RaveGuard to restart it.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 4 },
});
