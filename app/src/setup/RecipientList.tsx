import { useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';

import { Icon, ICON, PALETTE, RADII, SPACE, TEXT, TOUCH } from '../ui';
import { RecipientEditor } from './RecipientEditor';
import { RecipientListRow, ROW_GAP } from './RecipientListRow';
import { rowFieldKey, type SetupErrors } from './setupDraft';
import { SETTINGS_LAYOUT, SettingsTransition } from './SettingsTransition';
import {
  appendRow,
  isBlankRow,
  moveRowDown,
  moveRowTo,
  moveRowUp,
  removeRow,
  setRowKind,
  updateRow,
  type RecipientRow,
} from './setupRows';

// Setup step 1's list: who gets the alert, in texting order. A row is open (name and phone
// fields) while it is being filled in or has an error, and closed (the mockup's compact row with
// the drag handle) otherwise. Blank rows stay open, so a fresh install's three starter rows can
// be typed straight into.

type RowsEdit = (rows: readonly RecipientRow[]) => readonly RecipientRow[];

type Props = {
  rows: readonly RecipientRow[];
  errors: SetupErrors;
  onRowsChange: (edit: RowsEdit) => void;
};

function hasRowError(errors: SetupErrors, id: string): boolean {
  return errors[rowFieldKey(id, 'name')] !== undefined || errors[rowFieldKey(id, 'phone')] !== undefined;
}

export function RecipientList({ rows, errors, onRowsChange }: Props) {
  // Rows opened by the wearer, or blank when the step opened (filled-in ones start closed).
  const [openIds, setOpenIds] = useState<readonly string[]>(() => rows.filter(isBlankRow).map((row) => row.id));
  const open = (id: string) => setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  const close = (id: string) => setOpenIds((ids) => ids.filter((other) => other !== id));

  const addContact = () => {
    const id = randomUUID();
    onRowsChange((current) => appendRow(current, 'contact', () => id));
    open(id);
  };

  const removeContact = (id: string) => {
    onRowsChange((current) => removeRow(current, id));
    close(id);
  };

  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      <Animated.View collapsable={false} layout={SETTINGS_LAYOUT} style={styles.list}>
        {rows.map((row, index) => {
          const position = index + 1;
          const isOpen = openIds.includes(row.id) || hasRowError(errors, row.id);
          return (
            <SettingsTransition key={row.id}>
              {isOpen ? (
                <SettingsTransition isReveal key="editor">
                  <RecipientEditor
                    count={rows.length}
                    nameError={errors[rowFieldKey(row.id, 'name')]}
                    onChange={(changes) => onRowsChange((current) => updateRow(current, row.id, changes))}
                    onDone={() => close(row.id)}
                    onKindChange={(kind) => onRowsChange((current) => setRowKind(current, row.id, kind))}
                    onMoveDown={() => onRowsChange((current) => moveRowDown(current, row.id))}
                    onMoveUp={() => onRowsChange((current) => moveRowUp(current, row.id))}
                    onRemove={() => removeContact(row.id)}
                    phoneError={errors[rowFieldKey(row.id, 'phone')]}
                    position={position}
                    row={row}
                  />
                </SettingsTransition>
              ) : (
                <SettingsTransition isReveal key="summary">
                  <RecipientListRow
                    count={rows.length}
                    onMoveTo={(to) => onRowsChange((current) => moveRowTo(current, row.id, to))}
                    onOpen={() => open(row.id)}
                    position={position}
                    row={row}
                  />
                </SettingsTransition>
              )}
            </SettingsTransition>
          );
        })}
        <Animated.View layout={SETTINGS_LAYOUT}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a contact"
            onPress={addContact}
            style={({ pressed }) => [styles.add, pressed && styles.pressed]}>
            <Icon name="plus" size={ICON.sizeTiny} color={PALETTE.lavender} />
            <Text style={[TEXT.bodyStrong, styles.addLabel]}>Add a contact</Text>
          </Pressable>
        </Animated.View>
        {errors.recipients !== undefined && (
          <Text accessibilityLiveRegion="polite" style={TEXT.error}>
            {errors.recipients}
          </Text>
        )}
      </Animated.View>
    </LayoutAnimationConfig>
  );
}

const styles = StyleSheet.create({
  list: { gap: ROW_GAP },
  add: {
    minHeight: TOUCH.buttonSecondary,
    borderRadius: RADII.row,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: PALETTE.borderEmphasis,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
  },
  addLabel: { color: PALETTE.lavender },
  pressed: { opacity: 0.75 },
});
