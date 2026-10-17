import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import { ProtectionControl } from '../activeSession/ProtectionControl';
import {
  describeNextCheckIn,
  describeNoiseBackend,
  formatDose,
  formatRoomDb,
  motionLabel,
  protectionMode,
} from '../activeSession/readings';
import { ReadingTile } from '../activeSession/ReadingTile';
import { useProtectionLevel } from '../activeSession/useProtectionLevel';
import { useAutoProtection } from '../hearing/useAutoProtection';
import { ROUTES } from '../navigation/phaseNavigation';
import { errorMessage, phaseLabel } from '../session/describe';
import { useSessionReadings } from '../session/useSessionReadings';
import { useNow } from '../session/useNow';
import { useSessionState } from '../session/SessionStateProvider';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, SPACING, TYPE } from '../ui/theme';

// Active session (K8, PRD D9 and UI-2): room dB, dose, motion, the next check-in, the manual
// protection slider (HRG-5) and a large Stop. A thin container: readings come from
// useSessionReadings, the slider from useProtectionLevel.

const STOP_REFUSED = 'The session is still running: answer the check-in or alert first, then stop.';
/** The next check-in is shown in whole minutes, so a coarse clock is enough. */
const NEXT_CHECK_IN_TICK_MS = 15_000;

export default function SessionScreen() {
  const router = useRouter();
  const { phase } = useSessionState();
  const readings = useSessionReadings(phase?.phase ?? null);
  const protection = useProtectionLevel();
  const automatic = useAutoProtection();
  const now = useNow(NEXT_CHECK_IN_TICK_MS);
  const [stopMessage, setStopMessage] = useState<string | null>(null);

  const handleStop = async () => {
    setStopMessage(null);
    try {
      const isStopped = await RaveGuard.stopSession();
      if (isStopped) {
        router.dismissTo(ROUTES.setup);
      } else {
        setStopMessage(STOP_REFUSED);
      }
    } catch (e: unknown) {
      setStopMessage(`Couldn't stop the session (${errorMessage(e)}). Try again.`);
    }
  };

  const { noise } = protection;
  const modeLine = noise ? `${protectionMode(noise.level)} · ${describeNoiseBackend(noise)}` : null;
  const readError = readings.readError && `Couldn't read the session (${readings.readError}).`;
  const messages = [readError || automatic.error, protection.error, stopMessage].filter((m): m is string => Boolean(m));

  return (
    <ScrollView contentContainerStyle={LAYOUT.screen}>
      <Text accessibilityRole="header" style={TYPE.title}>
        Session running
      </Text>
      <View>
        <Text style={TYPE.label}>Status</Text>
        <Text style={TYPE.value}>{phaseLabel(phase)}</Text>
      </View>
      <View style={styles.grid}>
        <ReadingTile label="Room" value={formatRoomDb(readings.hearing?.roomDb ?? null)} />
        <ReadingTile label="Sound dose (estimate)" value={formatDose(readings.hearing?.dosePercent ?? null)} />
        <ReadingTile label="Motion" value={motionLabel(readings.motionState)} />
        <ReadingTile label="Next check-in" value={describeNextCheckIn(readings.nextCheckInAt, now)} />
      </View>
      <ProtectionControl
        level={noise?.level ?? null}
        modeLine={modeLine}
        sliderLevel={protection.sliderLevel}
        onChange={protection.choose}
        mode={automatic.mode}
        isSwitchingMode={automatic.isSwitching}
        onModeChange={automatic.setAuto}
      />
      {messages.length > 0 && (
        <Text accessibilityRole="alert" style={TYPE.error}>
          {messages.join('\n')}
        </Text>
      )}
      <ActionButton
        label="Stop session"
        variant="danger"
        size="large"
        accessibilityHint="Ends monitoring. Not possible while a check-in or alert is open."
        onPress={handleStop}
      />
      <ActionButton label="Debug" variant="secondary" onPress={() => router.push(ROUTES.debug)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.gap },
});
