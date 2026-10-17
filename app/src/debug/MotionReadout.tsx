import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import * as RaveGuard from '../../modules/raveguard-native';
import type { MotionEvent } from '../../modules/raveguard-native';
import { describeMotion, formatDegrees, formatG, NO_MOTION_YET } from '../session/describe';
import { Card, MetricTile, NO_VALUE, PALETTE, SPACE, StatusDot, TEXT } from '../ui';

// "Live head motion" (K11, PRD UI-6, Debug.html): every `onMotion` (Swift sends 10 Hz) shown
// as it arrives, in four JetBrains Mono tiles. It subscribes itself, so only this card
// re-renders at 10 Hz, not the whole panel. The count makes a stalled feed obvious. The card
// is one VoiceOver element that reads the whole reading as one line.

/** The rate Swift's motion source publishes at. */
const FEED_RATE = '10 Hz';

interface Reading {
  latest: MotionEvent;
  count: number;
}

export function MotionReadout() {
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    const subscription = RaveGuard.addListener('onMotion', (motion) =>
      setReading((current) => ({ latest: motion, count: (current?.count ?? 0) + 1 }))
    );
    return () => subscription.remove();
  }, []);

  const motion = reading?.latest ?? null;
  const count = reading?.count ?? 0;
  const isLive = motion !== null;
  return (
    <Card accessible accessibilityLabel={`Motion: ${describeMotion(motion)}`} padding="none" style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Live head motion</Text>
        <View style={styles.rate}>
          <StatusDot tone={isLive ? 'ok' : 'off'} size={7} />
          <Text style={[TEXT.smallStrong, { color: isLive ? PALETTE.mint : PALETTE.textFaint }]}>
            {isLive ? FEED_RATE : 'No feed'}
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <MetricTile variant="mono" label="pitch" value={motion ? formatDegrees(motion.pitch) : NO_VALUE} />
        <MetricTile variant="mono" label="roll" value={motion ? formatDegrees(motion.roll) : NO_VALUE} />
      </View>
      <View style={styles.row}>
        <MetricTile variant="mono" label="|accel|" value={motion ? formatG(motion.accelG) : NO_VALUE} />
        <MetricTile variant="mono" label="state" value={motion?.state ?? NO_VALUE} valueColor={PALETTE.lavender} />
      </View>
      <Text style={TEXT.small}>{isLive ? readoutCount(count) : NO_MOTION_YET}</Text>
    </Card>
  );
}

function readoutCount(count: number): string {
  return count === 1 ? '1 readout' : `${count} readouts`;
}

const styles = StyleSheet.create({
  card: { gap: SPACE.md, padding: SPACE.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...TEXT.labelNumeric, color: PALETTE.text },
  rate: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  row: { flexDirection: 'row', gap: SPACE.sm },
});
