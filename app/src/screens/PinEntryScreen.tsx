import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';
import { CancelView } from '../pin/CancelView';
import { sendPinResult } from '../pin/pinFeedback';
import { usePins } from '../pin/PinStoreProvider';
import { PIN_MAX_LENGTH } from '../pin/pinRules';
import { useCancelSequence } from '../pin/useCancelSequence';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, MIN_TAP_TARGET, TYPE } from '../ui/theme';

// The PIN gate (K6): the entry is checked against the salted hashes from Setup with
// usePins().store.verify().
//
// Duress rule (WORK_ORDER.md, K9): safe and duress both go to `startCancel`, one code path:
// the same haptic, a fixed 600 ms "Cancelling…" and the same "Cancelled. Stay safe." screen,
// with `pinResult` sent without waiting for it. The kind never reaches this screen's state.
// Every wrong entry is reported; Swift counts them and fires the escalation on the third (ESC-7).

/** What the line under the field says after a submit. */
type Notice = 'none' | 'wrong' | 'unchecked';

const NOTICE_TEXT: Record<Exclude<Notice, 'none'>, string> = {
  wrong: 'Wrong PIN. Try again.',
  // Not a strike: nothing is sent to Swift, and the check-in timeout still escalates.
  unchecked: "Couldn't check your PIN. Try again.",
};

export default function PinEntryScreen() {
  const router = useRouter();
  const { store, isLoaded, hasPins } = usePins();
  const { step, startCancel } = useCancelSequence();
  const [entry, setEntry] = useState('');
  const [notice, setNotice] = useState<Notice>('none');
  const [isChecking, setIsChecking] = useState(false);
  // Blocks a second submit before the re-render that disables the button lands.
  const isCheckingRef = useRef(false);

  const handleSubmit = async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    setIsChecking(true);
    const submitted = entry;
    setEntry('');
    try {
      const kind = await store.verify(submitted);
      if (kind === 'wrong') {
        setNotice('wrong');
        sendPinResult('wrong');
        return;
      }
      setNotice('none');
      startCancel(kind);
    } catch {
      // The PINs couldn't be read (Keychain error). Not the wearer's fault, so not a strike.
      setNotice('unchecked');
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  };

  if (step !== 'entering') {
    return <CancelView step={step} onDone={() => router.dismissTo(ROUTES.session)} />;
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
      {notice !== 'none' && <Text style={TYPE.error}>{NOTICE_TEXT[notice]}</Text>}
      {isLoaded && !hasPins && (
        <Text style={TYPE.body}>No PINs are set, so every PIN counts as wrong. Set them in Setup.</Text>
      )}
      <ActionButton isDisabled={isChecking} label="Submit" onPress={handleSubmit} />
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
