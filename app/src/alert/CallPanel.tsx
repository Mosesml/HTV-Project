import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../ui/ActionButton';
import { TYPE } from '../ui/theme';
import type { CallTarget } from './teammateCall';

// The Alert screen's Call button and the line that says who it rings (K10). It only ever
// rings the teammate in demo mode; see teammateCall.ts.

const CALL_HINT = "Rings your teammate's demo number. iOS asks before it dials.";

function explain(target: CallTarget): string {
  switch (target.kind) {
    case 'ready':
      return `Demo mode: rings your teammate at ${target.phone}.`;
    case 'notDemo':
      return 'Calling is only on in demo mode. RaveGuard never dials emergency services.';
    case 'noNumber':
      return "Add your teammate's number on the Debug screen to call from here.";
  }
}

type Props = {
  target: CallTarget;
  /** At SOS the button is the big red one. */
  isSos: boolean;
  error: string | null;
  onCall: () => void;
};

export function CallPanel({ target, isSos, error, onCall }: Props) {
  const isReady = target.kind === 'ready';
  return (
    <View style={styles.panel}>
      <ActionButton
        label="Call teammate"
        variant={isSos ? 'danger' : 'primary'}
        size={isSos ? 'large' : 'regular'}
        isDisabled={!isReady}
        accessibilityHint={isReady ? CALL_HINT : undefined}
        onPress={onCall}
      />
      <Text style={TYPE.label}>{explain(target)}</Text>
      {error !== null && (
        <Text accessibilityRole="alert" style={TYPE.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
});
