import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import { HearingCard } from '../activeSession/HearingCard';
import { MotionNow } from '../activeSession/MotionNow';
import { airPodsStatus, noiseStatus } from '../activeSession/readings';
import { SessionLivePill } from '../activeSession/SessionLivePill';
import { StatusTile } from '../activeSession/StatusTile';
import { useProtectionLevel } from '../activeSession/useProtectionLevel';
import { useSessionStartedAt } from '../activeSession/useSessionStartedAt';
import { ROUTES } from '../navigation/phaseNavigation';
import { useAutoProtection } from '../hearing/useAutoProtection';
import { errorMessage } from '../session/describe';
import { useSessionReadings } from '../session/useSessionReadings';
import { useSessionState } from '../session/SessionStateProvider';
import { HoldToConfirmButton, IconButton, PALETTE, Screen, SPACE, TEXT } from '../ui';

// Active session (docs/design/screens/Active.html; K8, PRD D9 and UI-2), shown while Swift
// reports `monitoring`: the "Session live" pill, the motion state and next check-in, the
// Hearing card with Automatic / Manual (BL1) and the protection slider (HRG-5), the AirPods
// and noise-control cards, and a press-and-hold Stop. A thin container: readings come from
// useSessionReadings, the slider from useProtectionLevel, the mode from useAutoProtection,
// the AirPods from useSessionState. No session logic lives here.

const STOP_REFUSED = 'The session is still running: answer the check-in or alert first, then stop.';
/** The coral square before "Stop session" (mockup: 14 pt, 3 pt corners). */
const STOP_MARK_SIZE = 14;
const STOP_MARK_RADIUS = 3;
/** The mockup's 18 pt rhythm between sections. */
const SECTION_GAP = 18;

export default function SessionScreen() {
  const router = useRouter();
  const { phase, airPodsConnected } = useSessionState();
  const readings = useSessionReadings(phase?.phase ?? null);
  const protection = useProtectionLevel();
  const automatic = useAutoProtection();
  const startedAt = useSessionStartedAt();
  const [stopMessage, setStopMessage] = useState<string | null>(null);

  const handleStop = async () => {
    setStopMessage(null);
    try {
      const isStopped = await RaveGuard.stopSession();
      if (isStopped) {
        router.dismissTo(ROUTES.home);
      } else {
        setStopMessage(STOP_REFUSED);
      }
    } catch (e: unknown) {
      setStopMessage(`Couldn't stop the session (${errorMessage(e)}). Try again.`);
    }
  };

  const airPods = airPodsStatus(airPodsConnected);
  const noise = noiseStatus(protection.noise);
  const readError = readings.readError && `Couldn't read the session (${readings.readError}).`;
  // When the session can't be read at all, the protection hook fails the same way: say it once.
  const automaticError = readError ? null : automatic.error;
  const messages = [readError, protection.error, automaticError, stopMessage].filter((m): m is string => Boolean(m));

  return (
    <Screen
      gap={SECTION_GAP}
      footer={
        <HoldToConfirmButton
          label="Stop session"
          leading={<View style={styles.stopMark} />}
          onConfirm={() => void handleStop()}
        />
      }>
      {/* VoiceOver's heading for the screen; the mockup draws none (the pill says it). */}
      <Text accessibilityRole="header" style={styles.visuallyHidden}>
        Session running
      </Text>
      <View style={styles.header}>
        <SessionLivePill startedAt={startedAt} />
        <IconButton icon="terminal" accessibilityLabel="Debug panel" onPress={() => router.push(ROUTES.debug)} />
      </View>
      <MotionNow motionState={readings.motionState} nextCheckInAt={readings.nextCheckInAt} />
      <HearingCard
        hearing={readings.hearing}
        level={protection.noise?.level ?? null}
        sliderLevel={protection.sliderLevel}
        onLevelChange={protection.choose}
        automatic={{
          mode: automatic.mode,
          hint: automatic.modeHint,
          isSwitching: automatic.isSwitching,
          onChange: automatic.setAuto,
        }}
      />
      <View style={styles.tiles}>
        <StatusTile title="AirPods" status={airPods.status} tone={airPods.tone} />
        <StatusTile title={noise.title} status={noise.status} tone={noise.tone} />
      </View>
      {messages.map((message) => (
        <Text key={message} accessibilityRole="alert" style={TEXT.error}>
          {message}
        </Text>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  tiles: { flexDirection: 'row', gap: SPACE.sm + SPACE.xxs },
  stopMark: {
    width: STOP_MARK_SIZE,
    height: STOP_MARK_SIZE,
    borderRadius: STOP_MARK_RADIUS,
    backgroundColor: PALETTE.coral,
  },
  // Screen-reader only: VoiceOver still reads it (opacity 0 would hide it), but it takes no room and matches the background.
  visuallyHidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: PALETTE.bg },
});
