import { ScrollView, Text } from 'react-native';

import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, TYPE } from '../ui/theme';

type Props = {
  step: 'cancelling' | 'cancelled';
  onDone: () => void;
};

/**
 * "Cancelling…" then "Cancelled. Stay safe." (K9). It is never told which PIN was entered,
 * so it shows the same thing for the safe and the duress PIN.
 */
export function CancelView({ step, onDone }: Props) {
  if (step === 'cancelling') {
    return (
      <ScrollView contentContainerStyle={LAYOUT.screen}>
        <Text accessibilityRole="header" style={TYPE.title}>
          Cancelling…
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={LAYOUT.screen}>
      <Text accessibilityRole="header" style={TYPE.title}>
        Cancelled. Stay safe.
      </Text>
      <ActionButton label="Done" onPress={onDone} />
    </ScrollView>
  );
}
