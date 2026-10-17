import { useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';

import { Avatar, Icon, ICON, PALETTE, RADII, SPACE, TEXT, TOUCH } from '../ui';
import { kindWord } from './permissionPreview';
import type { RecipientRow } from './setupRows';
import { dragTargetIndex } from './setupSteps';

// One recipient on Setup step 1, closed (docs/design/screens/Setup-Contacts.html): the numbered
// chip, the name, "phone · Contact", and the drag handle. Dragging the handle moves the row in
// the texting order; VoiceOver users get the same move as the row's Move up / Move down actions,
// and opening the row (a tap) shows visible Move up / Move down buttons.

/** The gap between rows in the list; a drag moves one place per row height plus this. */
export const ROW_GAP = 10;

type Props = {
  row: RecipientRow;
  /** 1 = texted first. */
  position: number;
  count: number;
  onOpen: () => void;
  /** Moves this row to a 0-based place in the texting order. */
  onMoveTo: (index: number) => void;
};

function rowTitle(row: RecipientRow, position: number): string {
  return row.name.trim() === '' ? `Recipient ${position}` : row.name.trim();
}

function rowSubtitle(row: RecipientRow): string {
  const phone = row.phone.trim() === '' ? 'No number yet' : row.phone.trim();
  return `${phone} · ${kindWord(row.kind)}`;
}

export function RecipientListRow({ row, position, count, onOpen, onMoveTo }: Props) {
  const index = position - 1;
  const [translate] = useState(() => new Animated.Value(0));
  // 0 at rest, 1 while dragged. Animated rather than state, so nothing re-renders mid-drag.
  const [lift] = useState(() => new Animated.Value(0));
  const [height, setHeight] = useState(0);
  const step = height + ROW_GAP;

  const responder = useMemo(() => {
    const finish = (distance: number) => {
      translate.setValue(0);
      lift.setValue(0);
      const to = dragTargetIndex(index, distance, step, count);
      if (to !== index) onMoveTo(to);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the drag once it has started, even if the list would like to scroll.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => lift.setValue(1),
      onPanResponderMove: (_event, gesture) => translate.setValue(gesture.dy),
      onPanResponderRelease: (_event, gesture) => finish(gesture.dy),
      onPanResponderTerminate: () => finish(0),
    });
  }, [count, index, lift, onMoveTo, step, translate]);

  const title = rowTitle(row, position);
  const actions = [
    ...(position > 1 ? [{ name: 'moveUp', label: 'Move up' }] : []),
    ...(position < count ? [{ name: 'moveDown', label: 'Move down' }] : []),
  ];
  const handleAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'moveUp') onMoveTo(index - 1);
    if (nativeEvent.actionName === 'moveDown') onMoveTo(index + 1);
  };

  return (
    <Animated.View
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={[
        styles.row,
        {
          zIndex: lift,
          borderColor: lift.interpolate({ inputRange: [0, 1], outputRange: [PALETTE.border, PALETTE.lavender] }),
          backgroundColor: lift.interpolate({ inputRange: [0, 1], outputRange: [PALETTE.surface, PALETTE.surface2] }),
          transform: [{ translateY: translate }],
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${position}. ${title}, ${rowSubtitle(row)}`}
        accessibilityHint="Opens this recipient to edit or move"
        accessibilityActions={actions}
        onAccessibilityAction={handleAction}
        onPress={onOpen}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <Avatar index={index} />
        <View style={styles.text}>
          <Text style={TEXT.bodyStrong}>{title}</Text>
          <Text style={TEXT.caption}>{rowSubtitle(row)}</Text>
        </View>
      </Pressable>
      <View
        {...responder.panHandlers}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        hitSlop={SPACE.xs}
        style={styles.handle}
        testID={`drag-handle-${position}`}>
        <Icon name="grip" size={ICON.sizeSmall} color={PALETTE.textFaint} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.xs,
    paddingLeft: SPACE.lg,
    paddingRight: SPACE.xs,
    borderRadius: RADII.row,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.surface,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: TOUCH.button, paddingVertical: SPACE.sm },
  pressed: { opacity: 0.8 },
  text: { flex: 1, gap: SPACE.xxs },
  handle: { width: TOUCH.min, height: TOUCH.min, alignItems: 'center', justifyContent: 'center' },
});
