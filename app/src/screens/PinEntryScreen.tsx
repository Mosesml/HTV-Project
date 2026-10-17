import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';
import { CancelView } from '../pin/CancelView';
import { sendPinResult } from '../pin/pinFeedback';
import { LivePinGateNotice } from '../pin/PinGateNotice';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '../pin/pinRules';
import { usePins } from '../pin/PinStoreProvider';
import { useCancelSequence } from '../pin/useCancelSequence';
import { useSessionState } from '../session/SessionStateProvider';
import { IconButton, Keypad, PinDots, Screen, SPACE, StageBar, TEXT, type Digit } from '../ui';

// The PIN gate (K6; PIN-Gate.html): the entry is checked against the salted hashes from Setup
// with usePins().store.verify().
//
// Duress rule (WORK_ORDER.md, K9): safe and duress both go to `startCancel`, one code path:
// the same haptic, a fixed 600 ms "Cancelling…" and the same "Cancelled. Stay safe." screen,
// with `pinResult` sent without waiting for it. The kind never reaches this screen's state.
// Every wrong entry is reported; Swift counts them and fires the escalation on the third (ESC-7).
//
// Entry is by the keypad. PINs are 4 to 8 digits and only their hashes are stored, so there
// is no auto-submit on the 4th digit: Submit turns on at 4 (docs/overnight/UI-pin-cancel.md).

/** What the line under the dots says after a submit. */
type Notice = 'none' | 'wrong' | 'unchecked';

const NOTICE_TEXT: Record<Exclude<Notice, 'none'>, string> = {
  wrong: 'Wrong PIN. Try again.',
  // Not a strike: nothing is sent to Swift, and the check-in timeout still escalates.
  unchecked: "Couldn't check your PIN. Try again.",
};

const HEADING = 'Enter your PIN to cancel';

export default function PinEntryScreen() {
  const router = useRouter();
  const { phase, phaseSeenAt } = useSessionState();
  const { store, isLoaded, hasPins } = usePins();
  const { step, startCancel } = useCancelSequence();
  const [entry, setEntry] = useState('');
  const [notice, setNotice] = useState<Notice>('none');
  const [isChecking, setIsChecking] = useState(false);
  // Blocks a second submit before the re-render that disables the key lands.
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

  const handleDigit = (digit: Digit) => setEntry((current) => (current + digit).slice(0, PIN_MAX_LENGTH));
  const handleDelete = () => setEntry((current) => current.slice(0, -1));

  if (step !== 'entering') {
    return <CancelView step={step} onDone={() => router.dismissTo(ROUTES.session)} />;
  }

  const isCheckIn = phase?.phase === 'checkIn';
  // From Alert or SOS ("I'm okay now") the wearer may change their mind; during the check-in
  // the session decides when the gate closes.
  const canGoBack = !isCheckIn && router.canGoBack();

  return (
    <Screen
      footer={
        <Keypad
          isDisabled={isChecking}
          onDelete={handleDelete}
          onDigit={handleDigit}
          leftKey={{ label: 'Submit PIN', icon: 'check', isEnabled: entry.length >= PIN_MIN_LENGTH, onPress: handleSubmit }}
        />
      }>
      {isCheckIn && <StageBar stage={phase.stage} />}
      {canGoBack && <IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={router.back} />}
      <View style={styles.heading}>
        <Text accessibilityRole="header" accessibilityLabel={HEADING} style={[TEXT.title, styles.centred]}>
          {'Enter your PIN\nto cancel'}
        </Text>
        <LivePinGateNotice phase={phase} phaseSeenAt={phaseSeenAt} />
      </View>
      <PinDots filled={entry.length} size="large" />
      {notice !== 'none' && (
        <Text accessibilityLiveRegion="polite" style={[TEXT.error, styles.centred]}>
          {NOTICE_TEXT[notice]}
        </Text>
      )}
      {isLoaded && !hasPins && (
        <Text style={[TEXT.body, styles.centred]}>No PINs are set, so every PIN counts as wrong. Set them in Setup.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { alignItems: 'center', gap: SPACE.md, paddingTop: SPACE.xs },
  centred: { textAlign: 'center' },
});
