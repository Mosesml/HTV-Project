import { StyleSheet, Text, View } from 'react-native';

import type { MotionState } from '../../modules/raveguard-native';
import { NO_VALUE_SPOKEN, SPACE, TEXT } from '../ui';
import { useNow } from '../session/useNow';
import { formatCountdown, motionLabel, NO_VALUE, spokenCountdown } from './readings';

type Props = {
  /** From `onMotion`; null before the first readout. */
  motionState: MotionState | null;
  /** The snapshot's `nextCheckInAt` (epoch ms); null in demo mode or when none is scheduled. */
  nextCheckInAt: number | null;
};

const TICK_MS = 1000;

/** "RIGHT NOW" / "Dancing" / "Next check-in in 12:40". The countdown ticks here, not in the whole screen. */
export function MotionNow({ motionState, nextCheckInAt }: Props) {
  const now = useNow(TICK_MS);
  const motion = motionLabel(motionState);
  return (
    <View style={styles.block}>
      <View accessible accessibilityLabel={`Right now: ${motion === NO_VALUE ? NO_VALUE_SPOKEN : motion}`} style={styles.motion}>
        <Text style={TEXT.overline}>Right now</Text>
        <Text style={TEXT.display}>{motion}</Text>
      </View>
      <Text accessibilityLabel={spokenCountdown(nextCheckInAt, now)} style={TEXT.body}>
        Next check-in in <Text style={styles.countdown}>{formatCountdown(nextCheckInAt, now)}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACE.sm - SPACE.xxs, paddingTop: SPACE.sm - SPACE.xxs, paddingBottom: SPACE.xxs },
  motion: { gap: SPACE.sm - SPACE.xxs },
  countdown: { ...TEXT.labelNumeric, fontSize: TEXT.body.fontSize },
});
