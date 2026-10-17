import { StyleSheet, Text, View } from 'react-native';

import { SPACE, TEXT, Toggle } from '../ui';

type Props = {
  /** From `onHearing.mode`: true while Swift's level loop sets protection. */
  isAuto: boolean;
  /** "RaveGuard sets protection from the room's loudness." or "You set protection with the slider." */
  hint: string;
  /** True while a mode change is on its way to Swift. */
  isSwitching: boolean;
  onChange: (isAuto: boolean) => void;
};

/**
 * Automatic protection (backlog BL1) in the Hearing card: an "Automatic" switch above the
 * slider. Every session starts automatic; moving the slider switches to manual in Swift,
 * and this switch hands protection back to the level loop. The mode shown is the one Swift
 * reported, never a guess.
 */
export function AutoProtectionRow({ isAuto, hint, isSwitching, onChange }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.words} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={TEXT.label}>Automatic</Text>
        <Text style={TEXT.small}>{hint}</Text>
      </View>
      <Toggle
        value={isAuto}
        onValueChange={onChange}
        isDisabled={isSwitching}
        accessibilityLabel="Automatic protection"
        accessibilityHint={hint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  words: { flex: 1, gap: SPACE.xxs },
});
