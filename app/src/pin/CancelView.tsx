import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, PALETTE, PrimaryButton, Ring, Screen, SPACE, TEXT } from '../ui';

// "Cancelling…" then "Cancelled. Stay safe." (K9; Cancelling.html, Cancelled.html). It is
// never told which PIN was entered, so it shows the same thing for the safe and the duress
// PIN. Nothing here animates or ticks: the Cancelling ring is static (a third drawn, as in
// the mockup), so every frame depends only on the step and the time the cancel started,
// which both PINs reach the same way.

type Props = {
  step: 'cancelling' | 'cancelled';
  /** "Back to my session". The wearer leaves on a tap, the same for both PINs (Kean). */
  onDone: () => void;
};

/** Cancelling.html's small ring: 88 pt, 8 pt stroke, a third of it drawn. */
const CANCELLING_RING = { size: 88, strokeWidth: 8, fraction: 1 / 3 } as const;
/** Cancelled.html's check badge: a 96 pt lavender disc with a 44 pt check. */
const BADGE_SIZE = 96;
const BADGE_ICON_SIZE = 44;

const CANCELLING_TEXT = 'Cancelling…';
const CANCELLED_TEXT = 'Cancelled. Stay safe.';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** "01:46": the wearer's local time, 24-hour, as in the mockup. */
export function formatCheckedInTime(at: number): string {
  const date = new Date(at);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function CancelView({ step, onDone }: Props) {
  // When "Cancelling…" first appeared, kept through the step change: that is when the wearer
  // checked in. The screen keeps this view mounted from "Cancelling…" to "Cancelled".
  const [checkedInAt] = useState(() => Date.now());

  if (step === 'cancelling') {
    return (
      <Screen scroll={false} isCentered gap={SPACE.xxl}>
        <Ring
          testID="cancelling-ring"
          size={CANCELLING_RING.size}
          strokeWidth={CANCELLING_RING.strokeWidth}
          fraction={CANCELLING_RING.fraction}
          color={PALETTE.lavender}
        />
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={TEXT.title}>
          {CANCELLING_TEXT}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      scroll={false}
      footer={<PrimaryButton label="Back to my session" onPress={onDone} />}
      contentStyle={styles.cancelled}
      gap={SPACE.xl}>
      <View style={styles.badge}>
        <Icon name="check" size={BADGE_ICON_SIZE} color={PALETTE.onLavender} />
      </View>
      <View style={styles.words}>
        <Text accessibilityRole="header" accessibilityLabel={CANCELLED_TEXT} style={[TEXT.titleLarge, styles.centred]}>
          {'Cancelled.\nStay safe.'}
        </Text>
        <Text style={[TEXT.body, styles.centred]}>{`Checked in at ${formatCheckedInTime(checkedInAt)}`}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cancelled: { justifyContent: 'center', alignItems: 'center', gap: SPACE.xl },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: PALETTE.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { alignItems: 'center', gap: SPACE.sm },
  centred: { textAlign: 'center' },
});
