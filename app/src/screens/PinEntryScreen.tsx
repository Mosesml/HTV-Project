import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import type { PinResultKind } from '../../modules/raveguard-native';
import { ROUTES } from '../navigation/phaseNavigation';
import { usePins } from '../pin/PinStoreProvider';
import { PIN_MAX_LENGTH } from '../pin/pinRules';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, MIN_TAP_TARGET, TYPE } from '../ui/theme';

// The PIN gate (K6): the entry is checked against the salted hashes from Setup with
// usePins().store.verify(). K9 adds the fixed 600 ms "Cancelling…", the haptic and
// frame-for-frame matching.
//
// Duress rule (WORK_ORDER.md): safe and duress go through `showCancelled`, one code path,
// to the same "Cancelled. Stay safe." screen, and `pinResult` is sent without waiting for it.
// Every wrong entry is reported; Swift counts them and fires the escalation on the third (ESC-7).

type Status = 'entering' | 'cancelled';
/** What the line under the field says after a submit. */
type Notice = 'none' | 'wrong' | 'unchecked';

const NOTICE_TEXT: Record<Exclude<Notice, 'none'>, string> = {
  wrong: 'Wrong PIN. Try again.',
  // Not a strike: nothing is sent to Swift, and the check-in timeout still escalates.
  unchecked: "Couldn't check your PIN. Try again.",
};

/** Fire and forget. The result must never change what the wearer sees, so a failure is not shown. */
function sendPinResult(kind: PinResultKind): void {
  RaveGuard.pinResult(kind).catch(() => {
    // Deliberately ignored: showing it could tell a safe PIN from a duress PIN. Swift logs its own failures.
  });
}

export default function PinEntryScreen() {
  const router = useRouter();
  const { store, isLoaded, hasPins } = usePins();
  const [entry, setEntry] = useState('');
  const [status, setStatus] = useState<Status>('entering');
  const [notice, setNotice] = useState<Notice>('none');
  const [isChecking, setIsChecking] = useState(false);
  // Blocks a second submit before the re-render that disables the button lands.
  const isCheckingRef = useRef(false);

  const showCancelled = (kind: 'safe' | 'duress') => {
    setStatus('cancelled');
    sendPinResult(kind);
  };

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
      showCancelled(kind);
    } catch {
      // The PINs couldn't be read (Keychain error). Not the wearer's fault, so not a strike.
      setNotice('unchecked');
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
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
