import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import * as RaveGuard from '../../modules/raveguard-native';
import type { MotionEvent, PhaseEvent, Settings } from '../../modules/raveguard-native';

// Temporary K2 smoke screen: proves the native module reaches JavaScript on a real phone,
// with phases and motion coming from the fake. K3 replaces it with the navigation shell, and
// the Debug panel (K11) can reuse its buttons.

const SMOKE_SETTINGS: Settings = {
  wearerName: 'Smoke test',
  selfDescription: 'K2 smoke screen',
  recipients: [],
  intervalMin: 30,
  loudnessTarget: 85,
  demo: true,
  teammatePhone: null,
  bridgeUrl: null,
};

const MS_PER_SECOND = 1000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describePhase(phase: PhaseEvent | null): string {
  if (!phase) return 'waiting for the module…';
  if (phase.phase !== 'checkIn' || phase.stageEndsAt === null) return phase.phase;
  const secondsLeft = Math.max(0, Math.round((phase.stageEndsAt - Date.now()) / MS_PER_SECOND));
  return `checkIn · ${phase.stage} · ${secondsLeft} s left`;
}

function describeMotion(motion: MotionEvent | null): string {
  if (!motion) return 'no readouts yet (start a session)';
  return `${motion.state} · pitch ${motion.pitch.toFixed(1)}° · roll ${motion.roll.toFixed(1)}° · ${motion.accelG.toFixed(2)} g`;
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
};

function ActionButton({ label, onPress }: ActionButtonProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

export default function Index() {
  const [phase, setPhase] = useState<PhaseEvent | null>(null);
  const [motion, setMotion] = useState<MotionEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    RaveGuard.getSnapshot()
      .then((snapshot) => setPhase((current) => current ?? snapshot.phase))
      .catch((e: unknown) => setError(errorMessage(e)));
    const subscriptions = [
      RaveGuard.addListener('onPhase', setPhase),
      RaveGuard.addListener('onMotion', setMotion),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  const run = (action: () => Promise<unknown>) => {
    setError(null);
    action().catch((e: unknown) => setError(errorMessage(e)));
  };

  const handleStart = () =>
    run(async () => {
      await RaveGuard.configure(SMOKE_SETTINGS);
      await RaveGuard.startSession();
    });

  const handleStop = () =>
    run(async () => {
      const stopped = await RaveGuard.stopSession();
      if (!stopped) setError('Stop refused: answer the check-in or escalation first.');
    });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>RaveGuard native module</Text>
      <View style={styles.readout}>
        <Text style={styles.label}>onPhase</Text>
        <Text style={styles.value}>{describePhase(phase)}</Text>
        <Text style={styles.label}>onMotion</Text>
        <Text style={styles.value}>{describeMotion(motion)}</Text>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <ActionButton label="Start session (demo)" onPress={handleStart} />
      <ActionButton label="Fire scenario 2 (fall)" onPress={() => run(() => RaveGuard.debugFire(2))} />
      <ActionButton label="Tap Cancel" onPress={() => run(RaveGuard.tapCancel)} />
      <ActionButton label="Stop session" onPress={handleStop} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '600', marginTop: 48 },
  readout: { gap: 4, paddingVertical: 8 },
  label: { fontSize: 13, opacity: 0.6 },
  value: { fontSize: 17, fontVariant: ['tabular-nums'] },
  error: { color: '#C62828' },
  button: {
    minHeight: 60,
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: '#208AEF',
  },
  buttonLabel: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});
