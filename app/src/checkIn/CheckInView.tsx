import { StyleSheet, Text, View } from 'react-native';

import type { CheckInStage } from '../../modules/raveguard-native';
import { ActionButton } from '../ui/ActionButton';
import { COLORS, SPACING } from '../ui/theme';
import type { StageCountdown } from './countdown';
import { CountdownRing } from './CountdownRing';
import { STAGES, stageTitle } from './stages';

// The Check-in screen's body (K7, PRD D8 / UI-3), presentational so it is tested on its own.
// Laid out for one hand in a dark room: the question and stage at the top, the ring in the
// middle, and one big full-width button at the bottom, under the thumb. VoiceOver reads it
// top to bottom: question, stage, hint, time left, then the button.

const CANCEL_HINT = "Tells RaveGuard you're okay and stops the check-in.";
const ENTER_PIN_HINT = 'Opens PIN entry to stop the alert.';
/** Dynamic Type cap for the big heading, so "Are you okay?" stays on two lines at most. */
const HEADING_MAX_FONT_SCALE = 1.3;
const BODY_MAX_FONT_SCALE = 1.6;

type Props = {
  /** Null when the phase isn't a check-in (for a moment, before the screen closes). */
  stage: CheckInStage | null;
  /** Null while the stage end is unknown. */
  countdown: StageCountdown | null;
  error: string | null;
  onCancel: () => void;
  onEnterPin: () => void;
};

export function CheckInView({ stage, countdown, error, onCancel, onEnterPin }: Props) {
  const info = stage === null ? null : STAGES[stage];
  const canCancel = info?.canCancel ?? true;
  const ringColor = info?.color ?? COLORS.stageWhisper;

  return (
    <View testID="check-in-screen" style={styles.screen}>
      <View style={styles.top}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={HEADING_MAX_FONT_SCALE} style={styles.question}>
          Are you okay?
        </Text>
        {stage !== null && info !== null && (
          <>
            <Text maxFontSizeMultiplier={BODY_MAX_FONT_SCALE} style={[styles.stage, { color: info.color }]}>
              {stageTitle(stage)}
            </Text>
            <Text maxFontSizeMultiplier={BODY_MAX_FONT_SCALE} style={styles.hint}>
              {info.hint}
            </Text>
          </>
        )}
      </View>

      <View style={styles.middle}>
        {countdown !== null && (
          <CountdownRing fraction={countdown.fraction} secondsLeft={countdown.secondsLeft} color={ringColor} />
        )}
      </View>

      <View style={styles.bottom}>
        {error !== null && (
          <Text accessibilityRole="alert" maxFontSizeMultiplier={BODY_MAX_FONT_SCALE} style={styles.error}>
            {error}
          </Text>
        )}
        {canCancel ? (
          <ActionButton label="Cancel" size="large" accessibilityHint={CANCEL_HINT} onPress={onCancel} />
        ) : (
          <ActionButton label="Enter PIN" size="large" accessibilityHint={ENTER_PIN_HINT} onPress={onEnterPin} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: SPACING.gutter,
    paddingBottom: SPACING.gutter,
    backgroundColor: COLORS.nightBackground,
  },
  top: { alignItems: 'center', gap: SPACING.gap, paddingTop: SPACING.gutter },
  middle: { flex: 1, justifyContent: 'center' },
  bottom: { gap: SPACING.gap },
  question: { fontSize: 44, fontWeight: '800', color: COLORS.nightText, textAlign: 'center' },
  stage: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: 22, color: COLORS.nightText, textAlign: 'center' },
  error: { fontSize: 17, color: COLORS.nightDanger, textAlign: 'center' },
});
