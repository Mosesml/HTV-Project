import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PinField } from '../pin/pinRules';
import { IconButton, Keypad, PinDots, PrimaryButton, SPACE, TEXT, TOUCH } from '../ui';
import { appendDigit, entryProblem, PIN_PHRASES } from './pinStep';

// Setup step 3's PIN entry, opened by a card's Change: the dots and the keypad (the same ones
// the PIN gate uses), then "Use this PIN". The entry stays on this screen and only goes into
// the draft; Finish setup stores it as a salted hash. Nothing here shows a digit.

type Props = {
  field: PinField;
  /** The other PIN in the draft (empty when unchanged), so the two can't end up the same. */
  other: string;
  onUse: (pin: string) => void;
  onCancel: () => void;
};

export function PinEntryPanel({ field, other, onUse, onCancel }: Props) {
  const [entry, setEntry] = useState('');
  const [hasTried, setHasTried] = useState(false);
  const problem = entryProblem(field, entry, other);

  const handleUse = () => {
    setHasTried(true);
    if (problem === null) onUse(entry);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={TEXT.title}>{`New ${PIN_PHRASES[field]}`}</Text>
        <Text style={TEXT.body}>Enter 4–8 digits.</Text>
      </View>
      <PinDots filled={entry.length} />
      {hasTried && problem !== null && (
        <Text accessibilityLiveRegion="polite" style={[TEXT.error, styles.centered]}>
          {problem}
        </Text>
      )}
      <Keypad
        onDelete={() => setEntry((current) => current.slice(0, -1))}
        onDigit={(digit) => setEntry((current) => appendDigit(current, digit))}
      />
      <View style={styles.footer}>
        <IconButton accessibilityLabel="Cancel PIN change" icon="chevronLeft" onPress={onCancel} size={TOUCH.button} />
        <PrimaryButton label="Use this PIN" onPress={handleUse} style={styles.use} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.xl },
  intro: { gap: SPACE.sm },
  centered: { textAlign: 'center' },
  footer: { flexDirection: 'row', gap: SPACE.md, alignItems: 'center' },
  use: { flex: 1 },
});
