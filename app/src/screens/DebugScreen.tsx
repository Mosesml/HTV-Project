import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import type { NoiseBackend } from '../../modules/raveguard-native';
import { DebugHeader } from '../debug/DebugHeader';
import { MotionReadout } from '../debug/MotionReadout';
import { NoiseBackendPicker } from '../debug/NoiseBackendPicker';
import { OfflineSwitch } from '../debug/OfflineSwitch';
import { ScenarioButtons } from '../debug/ScenarioButtons';
import {
  canFireScenario,
  configuresBeforeFiring,
  firedNotice,
  SCENARIO_BLOCKED,
  scenarioNames,
  SCENARIOS,
  type ScenarioNumber,
} from '../debug/scenarios';
import { StatusLine } from '../debug/StatusLine';
import { TeammatePhoneField } from '../debug/TeammatePhoneField';
import { TimingsControl } from '../debug/TimingsControl';
import { useDebugRunner } from '../debug/useDebugRunner';
import { useNoiseState } from '../debug/useNoiseState';
import { useSimulatedOffline } from '../debug/useSimulatedOffline';
import { ROUTES } from '../navigation/phaseNavigation';
import { usePins } from '../pin/PinStoreProvider';
import { describePhase } from '../session/describe';
import { useNow } from '../session/useNow';
import { useSessionState } from '../session/SessionStateProvider';
import { buildSampleSettings } from '../settings/sampleSettings';
import { useSettings } from '../settings/SettingsProvider';
import { Card, PrimaryButton, Screen, SecondaryButton, SectionLabel, SPACE, TEXT } from '../ui';

// The Debug panel (K11, PRD D11, UI-6, DEM-2; Debug.html). Top to bottom, as the mockup draws
// it: Back + "Simulated", the live head motion tiles (onMotion), Timings (demo/real, saved
// through K4's settings so it reaches configure()), Noise control (setNoiseBackend),
// Simulate offline (debugSetOffline, read back from the snapshot) and the seven scenarios
// (debugFire). Below the designed controls: the raw phase with Start / Tap Cancel / Stop, then
// K10's teammate number and K4's sample / reset tools; Reset settings also forgets the PINs.
// The panel only sends taps down; it never sees which PIN was entered (the duress rule).

const TICK_MS = 1000;
const STOP_REFUSED = 'Stop refused: answer the check-in or escalation first.';

export default function DebugScreen() {
  const router = useRouter();
  const { phase, snapshotError } = useSessionState();
  const { settings, isLoaded, save, reset } = useSettings();
  const { clearPins } = usePins();
  const now = useNow(TICK_MS);
  const noise = useNoiseState();
  const { isOffline, setOffline } = useSimulatedOffline(phase);
  const { run, error, notice, setError, setNotice } = useDebugRunner();

  // Back to wherever Debug was opened from (Home or Active session); Home when opened at launch.
  const handleBack = () => (router.canGoBack() ? router.back() : router.replace(ROUTES.home));

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

  const timings = settings.demo ? 'demo' : 'real';

  return (
    <Screen>
      <DebugHeader onBack={handleBack} />
      <StatusLine error={error ?? snapshotError} notice={notice} />
      <MotionReadout />
      <Section title="Timings">
        <TimingsControl isDemo={settings.demo} onChange={handleDemoChange} />
      </Section>
      <Section title="Noise control">
        <NoiseBackendPicker noise={noise} onSelect={handleBackend} />
      </Section>
      <OfflineSwitch isOffline={isOffline} onChange={handleOffline} />
      <Section title="Fire a scenario">
        <ScenarioButtons
          onFire={handleFire}
          blockedReason={canFireScenario(phase) ? null : SCENARIO_BLOCKED}
          names={scenarioNames(settings.recipients)}
        />
      </Section>
      <Section title="Session">
        <Card accessible accessibilityLabel={`Phase: ${describePhase(phase, now)}`} padding="none" style={styles.phase}>
          <Text style={TEXT.monoLabel}>onPhase</Text>
          <Text style={TEXT.mono}>{describePhase(phase, now)}</Text>
        </Card>
        <PrimaryButton
          label="Start session"
          caption={`${settings.demo ? 'Demo' : 'Real'} timings`}
          accessibilityLabel={`Start session (${timings} timings)`}
          onPress={handleStart}
        />
        <SecondaryButton label="Tap Cancel" onPress={() => run(RaveGuard.tapCancel)} />
        <SecondaryButton label="Stop session" tone="emphasis" onPress={handleStop} />
      </Section>
      <Section title="Demo tools">
        {/* Remounts when the saved number changes (launch read, sample, reset), so it shows it. */}
        <TeammatePhoneField key={`${isLoaded}:${settings.teammatePhone ?? ''}`} onSaved={handleTeammateSaved} />
        <SecondaryButton label="Save sample settings" onPress={handleSaveSample} />
        <SecondaryButton label="Reset settings" onPress={handleResetSettings} />
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionLabel variant="title">{title}</SectionLabel>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE.md },
  phase: { gap: SPACE.xxs, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
});
