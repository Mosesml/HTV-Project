import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import * as RaveGuard from '../../modules/raveguard-native';
import type { MotionEvent } from '../../modules/raveguard-native';
import { describeMotion, formatDegrees, formatG, NO_MOTION_YET } from '../session/describe';
import { COLORS, TYPE } from '../ui/theme';

// The Debug panel's live motion readout (K11, PRD UI-6): every `onMotion` (10 Hz) shown as
// it arrives. It subscribes itself, so only this small view re-renders at 10 Hz, not the
// whole panel. The count makes a stalled feed obvious.

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
  const countLabel = count === 1 ? '1 readout' : `${count} readouts`;
  return (
    <View accessible accessibilityLabel={`Motion: ${describeMotion(motion)}`} style={styles.card}>
      {motion === null ? (
        <Text style={TYPE.body}>{NO_MOTION_YET}</Text>
      ) : (
        <>
          <View style={styles.row}>
            <Field label="State" value={motion.state} />
            <Field label="Pitch" value={formatDegrees(motion.pitch)} />
            <Field label="Roll" value={formatDegrees(motion.roll)} />
            <Field label="Accel" value={formatG(motion.accelG)} />
          </View>
          <Text style={TYPE.label}>{countLabel}</Text>
        </>
      )}
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={TYPE.label}>{label}</Text>
      <Text style={TYPE.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: COLORS.card },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { minWidth: 64, gap: 2 },
});
