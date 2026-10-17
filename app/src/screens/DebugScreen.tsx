import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import * as RaveGuard from '../../modules/raveguard-native';
import type { MotionEvent } from '../../modules/raveguard-native';
import { describeMotion, describePhase, errorMessage } from '../session/describe';
import { PLACEHOLDER_SETTINGS } from '../session/placeholderSettings';
import { useNow } from '../session/useNow';
import { useSessionState } from '../session/SessionStateProvider';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, TYPE } from '../ui/theme';

// The K2 smoke screen's readout and buttons, moved here by K3. K11 grows this into the Debug
// panel: all 7 scenario buttons, the demo toggle and the noise backend picker.

const TICK_MS = 1000;
const FALL_SCENARIO = 2;
const STOP_REFUSED = 'Stop refused: answer the check-in or escalation first.';

export default function DebugScreen() {
  const { phase, snapshotError } = useSessionState();
  const now = useNow(TICK_MS);
  const [motion, setMotion] = useState<MotionEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const subscription = RaveGuard.addListener('onMotion', setMotion);
    return () => subscription.remove();
  }, []);

  const run = (action: () => Promise<unknown>) => {
    setError(null);
    action().catch((e: unknown) => setError(errorMessage(e)));
  };

  const handleStart = () =>
    run(async () => {
      await RaveGuard.configure(PLACEHOLDER_SETTINGS);
      await RaveGuard.startSession();
    });

  const handleStop = () =>
    run(async () => {
      const isStopped = await RaveGuard.stopSession();
      if (!isStopped) setError(STOP_REFUSED);
    });

  const shownError = error ?? snapshotError;

  return (
    <ScrollView contentContainerStyle={LAYOUT.screen}>
      <View style={styles.readout}>
        <Text style={TYPE.label}>onPhase</Text>
        <Text style={TYPE.value}>{describePhase(phase, now)}</Text>
        <Text style={TYPE.label}>onMotion</Text>
        <Text style={TYPE.value}>{describeMotion(motion)}</Text>
      </View>
      {shownError && <Text style={TYPE.error}>{shownError}</Text>}
      <ActionButton label="Start session (demo)" onPress={handleStart} />
      <ActionButton
        label={`Fire scenario ${FALL_SCENARIO} (fall)`}
        onPress={() => run(() => RaveGuard.debugFire(FALL_SCENARIO))}
      />
      <ActionButton label="Tap Cancel" onPress={() => run(RaveGuard.tapCancel)} />
      <ActionButton label="Stop session" variant="danger" onPress={handleStop} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  readout: { gap: 4, paddingVertical: 8 },
});
