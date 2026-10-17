import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SPACE, TEXT } from '../ui';
import { alertCallCaption, CALL_LABEL, callHint, callNote } from './callCopy';
import type { CallTarget } from './teammateCall';

// Alert's coral "Call for help" (docs/design/screens/Alert.html) and, when it's off, the line
// that says why. It only ever rings the teammate in demo mode; see teammateCall.ts.

type Props = {
  target: CallTarget;
  error: string | null;
  onCall: () => void;
};

export function CallPanel({ target, error, onCall }: Props) {
  const note = callNote(target);
  return (
    <View style={styles.panel}>
      <PrimaryButton
        label={CALL_LABEL}
        caption={alertCallCaption(target)}
        tone="coral"
        size="large"
        icon="phone"
        isDisabled={target.kind !== 'ready'}
        accessibilityHint={callHint(target)}
        onPress={onCall}
      />
      {note !== null && <Text style={TEXT.caption}>{note}</Text>}
      {error !== null && (
        <Text accessibilityRole="alert" style={TEXT.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.sm },
});
