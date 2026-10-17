import { Pressable, StyleSheet, View } from 'react-native';

import { PALETTE, TOUCH } from './theme';

/** `regular` 44 x 28 (the permissions grid), `large` 52 x 32 (Debug's Simulate offline). */
export type ToggleSize = 'regular' | 'large';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Required: a switch with no label is useless to VoiceOver ("Maya: see location"). */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Always on and can't be changed ("Get alerts: always on"); drawn in the locked colour. */
  isLocked?: boolean;
  isDisabled?: boolean;
  size?: ToggleSize;
  testID?: string;
};

const SIZES: Record<ToggleSize, { width: number; height: number; knob: number; pad: number }> = {
  regular: { width: 44, height: 28, knob: 22, pad: 3 },
  large: { width: 52, height: 32, knob: 24, pad: 4 },
};

/** A switch drawn to the mockups. The track is shorter than 44 pt, so hitSlop makes up the rest. */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
  isLocked = false,
  isDisabled = false,
  size = 'regular',
  testID,
}: Props) {
  const isOn = isLocked || value;
  const isInert = isLocked || isDisabled;
  const metrics = SIZES[size];
  const slop = Math.max(0, Math.ceil((TOUCH.min - metrics.height) / 2));
  const track = isLocked ? PALETTE.toggleLocked : isOn ? PALETTE.lavender : PALETTE.borderStrong;
  const knob = isOn ? PALETTE.onLavender : PALETTE.textFaint;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint ?? (isLocked ? 'Always on' : undefined)}
      accessibilityState={{ checked: isOn, disabled: isInert }}
      disabled={isInert}
      hitSlop={{ top: slop, bottom: slop, left: 4, right: 4 }}
      onPress={() => onValueChange(!value)}
      testID={testID}
      style={[
        styles.track,
        {
          width: metrics.width,
          height: metrics.height,
          borderRadius: metrics.height / 2,
          padding: metrics.pad,
          backgroundColor: track,
          justifyContent: isOn ? 'flex-end' : 'flex-start',
        },
        isDisabled && !isLocked && styles.disabled,
      ]}>
      <View style={{ width: metrics.knob, height: metrics.knob, borderRadius: metrics.knob / 2, backgroundColor: knob }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'center' },
  disabled: { opacity: 0.5 },
});
