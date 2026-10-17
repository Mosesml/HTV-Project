import { StyleSheet, Text, View } from 'react-native';

import type { ProtectionMode } from '../../modules/raveguard-native';
import { Segmented, SPACE, TEXT, type SegmentOption } from '../ui';

type Props = {
  /** From `onHearing.mode`: the mode Swift reported, never a guess. */
  mode: ProtectionMode;
  /** "RaveGuard sets protection from the room's loudness." or "You set protection with the slider." */
  hint: string;
  /** True while a mode change is on its way to Swift. */
  isSwitching: boolean;
  onChange: (isAuto: boolean) => void;
};

const MODE_OPTIONS: readonly SegmentOption<ProtectionMode>[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'manual', label: 'Manual' },
];

/**
 * Automatic protection (backlog BL1) in the Hearing card: Automatic or Manual, above the
 * slider. Every session starts automatic; moving the slider switches to manual in Swift, and
 * Automatic hands protection back to the level loop. Tapping the mode already in force sends
 * nothing.
 */
export function AutoProtectionRow({ mode, hint, isSwitching, onChange }: Props) {
  const handleChange = (next: ProtectionMode) => {
    if (next !== mode) onChange(next === 'auto');
  };
  return (
    <View style={styles.block}>
      <Segmented
        options={MODE_OPTIONS}
        value={mode}
        onChange={handleChange}
        isDisabled={isSwitching}
        accessibilityLabel="Protection mode"
      />
      <Text style={TEXT.small}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACE.sm },
});
