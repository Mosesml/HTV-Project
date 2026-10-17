import { StyleSheet, Text, View } from 'react-native';

import type { PhaseEvent } from '../../modules/raveguard-native';
import { stageCountdown } from '../checkIn/countdown';
import { useNow } from '../session/useNow';
import { FONTS, PALETTE, ProgressBar, SPACE, TEXT } from '../ui';

// The line under the PIN gate's heading (PIN-Gate.html): "Your contacts get a text in 0:09"
// with the 6 pt coral bar while the PIN stage counts down, or neutral copy when there is no
// countdown to show. Only the entry step mounts it, so its timer never runs on Cancelling…
// or Cancelled (the duress frame test compares those frame by frame).

/** From Alert or SOS ("I'm okay now"): the texts already went out. */
export const TEXTED_COPY = "Your contacts have been texted. Your PIN tells them you're okay.";
/** A check-in is open but there's no time to the texts to show (no `stageEndsAt`, or an earlier stage). */
export const UNTIMED_COPY = 'Enter it before your contacts get a text.';

/** Four updates a second, like Check-in's ring, so the bar drains smoothly. */
const TICK_MS = 250;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
/** The mockup's 200 pt bar. */
const BAR_WIDTH = 200;
const BAR_HEIGHT = 6;

export type PinGateNoticeValue =
  | { kind: 'countdown'; secondsLeft: number; totalSeconds: number; fraction: number }
  | { kind: 'text'; text: string }
  | null;

/** "0:09", "1:00": minutes and two-digit seconds. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE);
  const rest = whole % SECONDS_PER_MINUTE;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** What the gate says under its heading for `phase` at `now`. Pure, so it is unit tested. */
export function pinGateNotice(phase: PhaseEvent | null, phaseSeenAt: number | null, now: number): PinGateNoticeValue {
  if (phase === null) return null;
  if (phase.phase === 'escalated' || phase.phase === 'sos') return { kind: 'text', text: TEXTED_COPY };
  if (phase.phase !== 'checkIn') return null;
  // Only the PIN stage's end is when the texts go; an earlier stage's end isn't.
  if (phase.stage !== 'pinGate' || phase.stageEndsAt === null) return { kind: 'text', text: UNTIMED_COPY };

  const endsAt = phase.stageEndsAt;
  const { secondsLeft, fraction } = stageCountdown(endsAt, phaseSeenAt, now);
  const totalMs = phaseSeenAt === null ? 0 : endsAt - phaseSeenAt;
  const totalSeconds = totalMs > 0 ? Math.ceil(totalMs / MS_PER_SECOND) : secondsLeft;
  return { kind: 'countdown', secondsLeft, totalSeconds, fraction };
}

/** Renders a notice worked out by `pinGateNotice`. */
export function PinGateNotice({ notice }: { notice: PinGateNoticeValue }) {
  if (notice === null) return null;
  if (notice.kind === 'text') {
    return <Text style={[TEXT.body, styles.centred]}>{notice.text}</Text>;
  }
  const time = formatCountdown(notice.secondsLeft);
  return (
    <View style={styles.countdown}>
      <Text accessibilityLabel={`Your contacts get a text in ${time}`} style={[TEXT.body, styles.centred]}>
        {'Your contacts get a text in '}
        <Text style={styles.time}>{time}</Text>
      </Text>
      <ProgressBar
        fraction={notice.fraction}
        accessibilityLabel="Time to enter your PIN"
        valueText={`${notice.secondsLeft} of ${notice.totalSeconds} seconds left`}
        color={PALETTE.coral}
        height={BAR_HEIGHT}
        style={styles.bar}
      />
    </View>
  );
}

type LiveProps = {
  phase: PhaseEvent | null;
  phaseSeenAt: number | null;
};

/** The countdown that ticks; mounted only while it has something to count. */
function TickingNotice({ phase, phaseSeenAt }: LiveProps) {
  const now = useNow(TICK_MS);
  return <PinGateNotice notice={pinGateNotice(phase, phaseSeenAt, now)} />;
}

/**
 * The gate's notice for the live phase. A timer runs only while the PIN stage has an end to
 * count down to; every other notice is static.
 */
export function LivePinGateNotice({ phase, phaseSeenAt }: LiveProps) {
  const isCounting = phase?.phase === 'checkIn' && phase.stage === 'pinGate' && phase.stageEndsAt !== null;
  if (isCounting) return <TickingNotice phase={phase} phaseSeenAt={phaseSeenAt} />;
  return <PinGateNotice notice={pinGateNotice(phase, phaseSeenAt, 0)} />;
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
  countdown: { alignItems: 'center', gap: SPACE.md },
  time: { fontFamily: FONTS.manropeBold, color: PALETTE.coral, fontVariant: ['tabular-nums'] },
  bar: { alignSelf: 'center', width: BAR_WIDTH },
});
