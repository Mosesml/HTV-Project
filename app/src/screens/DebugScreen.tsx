import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import * as RaveGuard from '../../modules/raveguard-native';
import type { NoiseBackend } from '../../modules/raveguard-native';
import { DemoToggle } from '../debug/DemoToggle';
import { MotionReadout } from '../debug/MotionReadout';
import { NoiseBackendPicker } from '../debug/NoiseBackendPicker';
import { OfflineSwitch } from '../debug/OfflineSwitch';
import { ScenarioButtons } from '../debug/ScenarioButtons';
import {
  canFireScenario,
  configuresBeforeFiring,
  firedNotice,
  SCENARIO_BLOCKED,
  SCENARIOS,
  type ScenarioNumber,
} from '../debug/scenarios';
import { TeammatePhoneField } from '../debug/TeammatePhoneField';
import { useDebugRunner } from '../debug/useDebugRunner';
import { useNoiseState } from '../debug/useNoiseState';
import { useSimulatedOffline } from '../debug/useSimulatedOffline';
import { usePins } from '../pin/PinStoreProvider';
import { describePhase } from '../session/describe';
import { useNow } from '../session/useNow';
import { useSessionState } from '../session/SessionStateProvider';
import { buildSampleSettings } from '../settings/sampleSettings';
import { useSettings } from '../settings/SettingsProvider';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, TYPE } from '../ui/theme';

// The Debug panel (K11, PRD D11, UI-6, DEM-2), grown from the K2 smoke screen: the raw phase,
// the live motion readout, Start/Stop, the seven scenario buttons (debugFire), the demo/real
// toggle (saved through K4's settings, so it reaches configure()), the noise backend picker
// (setNoiseBackend) and "Simulate offline" (debugSetOffline). K4's settings buttons and
// K10's teammate number stay at the bottom; Reset settings also forgets the PINs (K5).
// The panel only sends taps down; it never sees which PIN was entered (the duress rule).

const TICK_MS = 1000;
const STOP_REFUSED = 'Stop refused: answer the check-in or escalation first.';

export default function DebugScreen() {
  const { phase, snapshotError } = useSessionState();
  const { settings, isLoaded, save, reset } = useSettings();
  const { clearPins } = usePins();
  const now = useNow(TICK_MS);
  const noise = useNoiseState();
  const { isOffline, setOffline } = useSimulatedOffline(phase);
  const { run, error, notice, setError, setNotice } = useDebugRunner();

  const handleStart = () =>
    run(async () => {
      await RaveGuard.configure(settings);
      await RaveGuard.startSession();
    });

  const handleStop = () =>
    run(async () => {
      const isStopped = await RaveGuard.stopSession();
      if (!isStopped) throw new Error(STOP_REFUSED);
    });

  const handleFire = (scenario: ScenarioNumber) => {
    const shouldConfigure = configuresBeforeFiring(phase);
    run(async () => {
      if (shouldConfigure) await RaveGuard.configure(settings);
      await RaveGuard.debugFire(scenario);
    }, firedNotice(SCENARIOS[scenario - 1]));
  };

  const handleDemoChange = (isDemo: boolean) =>
    run(() => save({ ...settings, demo: isDemo }), isDemo ? 'Demo timings saved' : 'Real timings saved');

  const handleBackend = (backend: NoiseBackend) => run(() => RaveGuard.setNoiseBackend(backend));

  const handleOffline = (on: boolean) => run(() => setOffline(on));

  const handleSaveSample = () => run(() => save(buildSampleSettings()), 'Sample settings saved');

  const handleResetSettings = () =>
    run(async () => {
      await reset();
      await clearPins();
    }, 'Settings reset to the defaults');

  const handleTeammateSaved = (message: string) => {
    setError(null);
    setNotice(message);
  };

  const shownError = error ?? snapshotError;
  const timings = settings.demo ? 'demo' : 'real';

  return (
    <ScrollView contentContainerStyle={LAYOUT.screen}>
      <View style={styles.readout}>
        <Text style={TYPE.label}>onPhase</Text>
        <Text style={TYPE.value}>{describePhase(phase, now)}</Text>
      </View>
      <Section title="onMotion">
        <MotionReadout />
      </Section>
      {shownError && <Text style={TYPE.error}>{shownError}</Text>}
      {notice && <Text style={TYPE.body}>{notice}</Text>}
      <Section title="Session">
        <ActionButton label={`Start session (${timings} timings)`} onPress={handleStart} />
        <ActionButton label="Tap Cancel" variant="secondary" onPress={() => run(RaveGuard.tapCancel)} />
        <ActionButton label="Stop session" variant="danger" onPress={handleStop} />
      </Section>
      <Section title="Scenarios (debugFire)">
        <ScenarioButtons onFire={handleFire} blockedReason={canFireScenario(phase) ? null : SCENARIO_BLOCKED} />
      </Section>
      <Section title="Timings">
        <DemoToggle isDemo={settings.demo} onChange={handleDemoChange} />
      </Section>
      <Section title="Noise backend (setNoiseBackend)">
        <NoiseBackendPicker noise={noise} onSelect={handleBackend} />
      </Section>
      <Section title="Network (debugSetOffline)">
        <OfflineSwitch isOffline={isOffline} onChange={handleOffline} />
      </Section>
      <Section title="Settings (K4)">
        <ActionButton label="Save sample settings" variant="secondary" onPress={handleSaveSample} />
        <ActionButton label="Reset settings" variant="secondary" onPress={handleResetSettings} />
      </Section>
      <Section title="Demo SOS call (K10)">
        {/* Remounts when the saved number changes (launch read, sample, reset), so it shows it. */}
        <TeammatePhoneField key={`${isLoaded}:${settings.teammatePhone ?? ''}`} onSaved={handleTeammateSaved} />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={TYPE.label}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { gap: 4, paddingVertical: 8 },
  section: { gap: 8, paddingTop: 8 },
});
