import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import type { PinResultKind } from '../../modules/raveguard-native';
import { ROUTES } from '../navigation/phaseNavigation';
import { checkPlaceholderPin } from '../pin/placeholderPinCheck';
import { PIN_MAX_LENGTH } from '../pin/pinRules';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, MIN_TAP_TARGET, TYPE } from '../ui/theme';

// Skeleton (K3). K6 swaps the placeholder check for the real PIN gate; K9 adds the fixed
// 600 ms "Cancelling…", the haptic and frame-for-frame matching.
//
// Duress rule (WORK_ORDER.md): safe and duress go through `showCancelled`, one code path,
// to the same "Cancelled. Stay safe." screen, and `pinResult` is sent without waiting for it.

type Status = 'entering' | 'cancelled';

/** Fire and forget. The result must never change what the wearer sees, so a failure is not shown. */
function sendPinResult(kind: PinResultKind): void {
  RaveGuard.pinResult(kind).catch(() => {
    // Deliberately ignored: showing it could tell a safe PIN from a duress PIN. Swift logs its own failures.
  });
}

export default function PinEntryScreen() {
  const router = useRouter();
  const [entry, setEntry] = useState('');
  const [status, setStatus] = useState<Status>('entering');
  const [isWrong, setIsWrong] = useState(false);

  const showCancelled = (kind: 'safe' | 'duress') => {
    setStatus('cancelled');
    sendPinResult(kind);
  };

  const handleSubmit = () => {
    const kind = checkPlaceholderPin(entry);
    setEntry('');
    if (kind === 'wrong') {
      setIsWrong(true);
      sendPinResult('wrong');
      return;
    }
    showCancelled(kind);
  };

  if (status === 'cancelled') {
    return (
      <ScrollView contentContainerStyle={LAYOUT.screen}>
        <Text accessibilityRole="header" style={TYPE.title}>
          Cancelled. Stay safe.
        </Text>
        <ActionButton label="Done" onPress={() => router.dismissTo(ROUTES.session)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={LAYOUT.screen} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={TYPE.title}>
        Enter your PIN
      </Text>
      <TextInput
        accessibilityLabel="PIN"
        autoFocus
        keyboardType="number-pad"
        maxLength={PIN_MAX_LENGTH}
        onChangeText={setEntry}
        onSubmitEditing={handleSubmit}
        secureTextEntry
        style={styles.input}
        value={entry}
      />
      {isWrong && <Text style={TYPE.error}>Wrong PIN. Try again.</Text>}
      <ActionButton label="Submit" onPress={handleSubmit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: MIN_TAP_TARGET,
    borderWidth: 2,
    borderRadius: 12,
    borderColor: '#9CA3AF',
    paddingHorizontal: 16,
    fontSize: 28,
    letterSpacing: 8,
  },
});
