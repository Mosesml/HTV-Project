import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent, type AccessibilityActionInfo } from 'react-native';

import { IconChip } from './IconChip';
import type { IconName } from './icons';
import { PALETTE, TEXT, TOUCH } from './theme';

type Props = {
  title: string;
  subtitle?: string;
  /** An IconChip is drawn from these when `leading` isn't given. */
  icon?: IconName;
  iconColor?: string;
  /** Anything at the start: an Avatar, a custom chip. */
  leading?: ReactNode;
  /** Anything at the end: a StatusDot, a status word, a drag handle. */
  trailing?: ReactNode;
  /** Draws the divider under the row; turn it off for the last row in a Card. Default true. */
  hasDivider?: boolean;
  /** Makes the row a button. */
  onPress?: () => void;
  /** Defaults to "title, subtitle". */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** E.g. "Move up" / "Move down" for reordering. */
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  testID?: string;
};

/**
 * One row in a Card: leading chip or avatar, a title with an optional subtitle, and anything
 * trailing. VoiceOver reads the row as one element.
 */
export function ListRow({
  title,
  subtitle,
  icon,
  iconColor,
  leading,
  trailing,
  hasDivider = true,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityActions,
  onAccessibilityAction,
  testID,
}: Props) {
  const start = leading ?? (icon !== undefined ? <IconChip icon={icon} color={iconColor} /> : null);
  const label = accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ');
  const content = (
    <>
      {start}
      <View style={styles.text}>
        <Text style={TEXT.bodyStrong}>{title}</Text>
        {subtitle !== undefined && <Text style={TEXT.caption}>{subtitle}</Text>}
      </View>
      {trailing}
    </>
  );
  const rowStyle = [styles.row, hasDivider && styles.divider];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [rowStyle, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      testID={testID}
      style={rowStyle}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, minHeight: TOUCH.min },
  divider: { borderBottomWidth: 1, borderBottomColor: PALETTE.border },
  text: { flex: 1, gap: 2 },
  pressed: { opacity: 0.8 },
});
