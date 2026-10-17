import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';

import { HOLD_TO_CONFIRM_MS, PALETTE, RADII, TEXT } from './theme';

type Props = {
  label: string;
  /** Called once the press has been held for `holdMs`, or on VoiceOver's activate (double tap). */
  onConfirm: () => void;
  /** Default 1000 ms (Kean: press-and-hold for 1 s to stop the session). */
  holdMs?: number;
  /** The visible second line, default "Press and hold". */
  caption?: string;
  /** Drawn before the label, e.g. Stop session's coral square. */
  leading?: ReactNode;
  isDisabled?: boolean;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
  /** Defaults to "Press and hold for 1 second. With VoiceOver, double-tap." */
  accessibilityHint?: string;
  testID?: string;
};

const RELEASE_MS = 150;
const MS_PER_SECOND = 1000;

function defaultHint(holdMs: number): string {
  const seconds = holdMs / MS_PER_SECOND;
  return `Press and hold for ${seconds} ${seconds === 1 ? 'second' : 'seconds'}. With VoiceOver, double-tap.`;
}

/**
 * A button that only acts when held (Stop session), so a brush in a pocket or a crowd can't
 * stop protection. A fill grows across the button while it is held; letting go early cancels.
 * VoiceOver can't hold, so its activate action (double tap) confirms straight away.
 */
export function HoldToConfirmButton({
  label,
  onConfirm,
  holdMs = HOLD_TO_CONFIRM_MS,
  caption = 'Press and hold',
  leading,
  isDisabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: Props) {
  const [progress] = useState(() => new Animated.Value(0));
  const [isHolding, setIsHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );

  const confirm = () => {
    timer.current = null;
    setIsHolding(false);
    progress.stopAnimation();
    progress.setValue(0);
    onConfirm();
  };

  const handlePressIn = () => {
    if (isDisabled || timer.current !== null) return;
    setIsHolding(true);
    timer.current = setTimeout(confirm, holdMs);
    Animated.timing(progress, { toValue: 1, duration: holdMs, useNativeDriver: false }).start();
  };

  const handlePressOut = () => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    setIsHolding(false);
    Animated.timing(progress, { toValue: 0, duration: RELEASE_MS, useNativeDriver: false }).start();
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (!isDisabled && event.nativeEvent.actionName === 'activate') onConfirm();
  };

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const textColor = isDisabled ? PALETTE.textFaint : PALETTE.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint ?? defaultHint(holdMs)}
      accessibilityState={{ disabled: isDisabled, busy: isHolding }}
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={handleAccessibilityAction}
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      testID={testID}
      style={[styles.button, isDisabled && styles.disabled]}>
      <Animated.View pointerEvents="none" testID="hold-progress" style={[styles.fill, { width }]} />
      <View style={styles.content} pointerEvents="none">
        <View style={styles.labelRow}>
          {leading}
          <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        </View>
        <Text style={[TEXT.small, styles.caption]}>{caption}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    minHeight: 64,
    borderRadius: RADII.card,
    borderWidth: 1.5,
    borderColor: PALETTE.borderEmphasis,
    backgroundColor: PALETTE.surface,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: PALETTE.coralSoft },
  content: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 20, gap: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { ...TEXT.button, fontSize: 18 },
  caption: { textAlign: 'center' },
  disabled: { opacity: 0.6 },
});
