import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import * as RaveGuard from '../../modules/raveguard-native';
import type { MotionEvent } from '../../modules/raveguard-native';
import { TeammatePhoneField } from '../debug/TeammatePhoneField';
import { usePins } from '../pin/PinStoreProvider';
import { describeMotion, describePhase, errorMessage } from '../session/describe';
import { useNow } from '../session/useNow';
import { useSessionState } from '../session/SessionStateProvider';
import { buildSampleSettings } from '../settings/sampleSettings';
import { useSettings } from '../settings/SettingsProvider';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, TYPE } from '../ui/theme';

// The K2 smoke screen's readout and buttons, moved here by K3. K11 grows this into the Debug
// panel: all 7 scenario buttons, the demo toggle and the noise backend picker. K4 added the
// settings buttons; Reset settings also forgets the PINs (K5), so setup can start from scratch.
// K10 added the teammate's number the demo SOS call rings.

const TICK_MS = 1000;
const FALL_SCENARIO = 2;
const STOP_REFUSED = 'Stop refused: answer the check-in or escalation first.';

export default function DebugScreen() {
  const { phase, snapshotError } = useSessionState();
  const { settings, isLoaded, save, reset } = useSettings();
  const { clearPins } = usePins();
  const now = useNow(TICK_MS);
  const [motion, setMotion] = useState<MotionEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const subscription = RaveGuard.addListener('onMotion', setMotion);
    return () => subscription.remove();
  }, []);

  const run = (action: () => Promise<unknown>) => {
    setError(null);
    setNotice(null);
    action().catch((e: unknown) => setError(errorMessage(e)));
  };

  // The saved settings with demo timings, whatever the saved demo flag says.
  const handleStart = () =>
    run(async () => {
      await RaveGuard.configure({ ...settings, demo: true });
      await RaveGuard.startSession();
    });

  const handleSaveSample = () =>
    run(async () => {
      await save(buildSampleSettings());
      setNotice('Sample settings saved');
    });

  const handleResetSettings = () =>
    run(async () => {
      await reset();
      await clearPins();
      setNotice('Settings reset to the defaults');
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
      {notice && <Text style={TYPE.body}>{notice}</Text>}
      <ActionButton label="Start session (demo)" onPress={handleStart} />
      <ActionButton
        label={`Fire scenario ${FALL_SCENARIO} (fall)`}
        onPress={() => run(() => RaveGuard.debugFire(FALL_SCENARIO))}
      />
      <ActionButton label="Tap Cancel" onPress={() => run(RaveGuard.tapCancel)} />
      <ActionButton label="Stop session" variant="danger" onPress={handleStop} />
      <Text style={TYPE.label}>Settings (K4)</Text>
      <ActionButton label="Save sample settings" variant="secondary" onPress={handleSaveSample} />
      <ActionButton label="Reset settings" variant="secondary" onPress={handleResetSettings} />
      <Text style={TYPE.label}>Demo SOS call (K10)</Text>
      {/* Remounts when the saved number changes (launch read, sample, reset), so it shows it. */}
      <TeammatePhoneField key={`${isLoaded}:${settings.teammatePhone ?? ''}`} onSaved={setNotice} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  readout: { gap: 4, paddingVertical: 8 },
});
