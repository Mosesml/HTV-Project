import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { CheckInStage, CheckInTrigger } from '../../modules/raveguard-native';
import { CountdownRing, Icon, ICON, InfoCallout, PrimaryButton, Screen, SPACE, StageBar, STAGE_COLORS, TEXT } from '../ui';
import type { StageCountdown } from './countdown';
import { checkInRingSize } from './ringSize';
import { STAGES } from './stages';
import { NO_TRIGGER_LABEL, triggerCopy } from './triggerCopy';

// The Check-in screen's body (K7, PRD D8 / UI-3), presentational so it is tested on its own.
// One component for both stages (brief rule 5), from CheckIn-Whisper.html and CheckIn-Loud.html:
// the ladder, what started it, the ring, "Are you okay?", what the earbuds are doing and the
// nod copy, then one 96 pt "I'm okay" pinned at the bottom under the thumb. Whisper and loud
// differ only in accent, words, ring colour and the trigger card.

const OKAY_HINT = "Tells RaveGuard you're okay, the same as a nod.";
const ENTER_PIN_HINT = 'Opens PIN entry.';
/** Dynamic Type caps: the screen doesn't scroll, so keep the heading and lines from running off it. */
const HEADING_MAX_FONT_SCALE = 1.3;
const BODY_MAX_FONT_SCALE = 1.4;

type Props = {
  /** Null when the phase isn't a check-in (for a moment, before the screen closes). */
  stage: CheckInStage | null;
  /** Null while the stage end is unknown: the ring stays full and shows a dash. */
  countdown: StageCountdown | null;
  /** What started the check-in (`onPhase`'s trigger). */
  trigger: CheckInTrigger | null;
  error: string | null;
  onCancel: () => void;
  onEnterPin: () => void;
};

function TriggerNote({ stage, trigger }: { stage: CheckInStage | null; trigger: CheckInTrigger | null }) {
  const copy = triggerCopy(trigger);
  const showsCard = stage !== null && STAGES[stage].showsTriggerCard;
  if (!showsCard) {
    return (
      <Text maxFontSizeMultiplier={BODY_MAX_FONT_SCALE} style={[TEXT.overline, styles.triggerLabel]}>
        {copy?.title ?? NO_TRIGGER_LABEL}
      </Text>
    );
  }
  if (copy === null) return null;
  return (
    <View style={styles.stretch}>
      <InfoCallout variant="card" tone="warning" icon={copy.icon} title={copy.title} testID="check-in-trigger-card">
        {copy.detail}
      </InfoCallout>
    </View>
  );
}

export function CheckInView({ stage, countdown, trigger, error, onCancel, onEnterPin }: Props) {
  const { height } = useWindowDimensions();
  const info = stage === null ? null : STAGES[stage];
  const canCancel = info?.canCancel ?? true;

  const footer = (
    <>
      {error !== null && (
        <Text accessibilityRole="alert" maxFontSizeMultiplier={BODY_MAX_FONT_SCALE} style={[TEXT.error, styles.centred]}>
          {error}
        </Text>
      )}
      {canCancel ? (
        <PrimaryButton label="I'm okay" caption="Cancel the check-in" size="huge" accessibilityHint={OKAY_HINT} onPress={onCancel} />
      ) : (
        <PrimaryButton
          label="Enter PIN"
          caption="Stop the alert"
          tone="coral"
          size="huge"
          accessibilityHint={ENTER_PIN_HINT}
          onPress={onEnterPin}
        />
      )}
    </>
  );

  return (
    <Screen scroll={false} testID="check-in-screen" contentStyle={styles.content} footer={footer}>
      <StageBar stage={stage} />
      <TriggerNote stage={stage} trigger={trigger} />
      <CountdownRing
        secondsLeft={countdown?.secondsLeft ?? null}
        fraction={countdown?.fraction ?? 1}
        color={info?.color ?? STAGE_COLORS.whisper}
        size={checkInRingSize(height)}
      />
      <View style={styles.question}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={HEADING_MAX_FONT_SCALE} style={[TEXT.titleLarge, styles.centred]}>
          Are you okay?
        </Text>
        {info !== null && (
          <>
            <View style={styles.line}>
              <Icon name={info.lineIcon} size={ICON.sizeTiny} color={info.lineColor} />
              <Text maxFontSizeMultiplier={BODY_MAX_FONT_SCALE} style={[TEXT.bodyStrong, { color: info.lineColor }]}>
                {info.line}
              </Text>
            </View>
            <Text maxFontSizeMultiplier={BODY_MAX_FONT_SCALE} style={[TEXT.body, styles.centred]}>
              {info.nod}
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center' },
  stretch: { alignSelf: 'stretch' },
  // The mockup sets the whisper label 10 pt further from the ladder.
  triggerLabel: { paddingTop: SPACE.sm + SPACE.xxs },
  question: { alignItems: 'center', gap: SPACE.sm + SPACE.xxs },
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  centred: { textAlign: 'center' },
});
