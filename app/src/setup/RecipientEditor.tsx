import { StyleSheet, Text, View } from 'react-native';

import type { RecipientKind } from '../../modules/raveguard-native';
import { MAX_NAME_LENGTH } from '../settings/defaults';
import { Avatar, PALETTE, RADII, Segmented, SPACE, TEXT, TextField } from '../ui';
import { kindWord } from './permissionPreview';
import type { RecipientRow, RowChanges } from './setupRows';
import { SmallButton } from './SmallButton';

// One recipient opened for editing on Setup step 1: name, phone, contact or venue staff, and the
// visible Move up / Move down / Remove. Every control names the recipient's place in the texting
// order ("Phone, recipient 2"), so VoiceOver users know which row they are in.

const KIND_OPTIONS: readonly { value: RecipientKind; label: string }[] = [
  { value: 'contact', label: 'Contact' },
  { value: 'venueStaff', label: 'Venue staff' },
];

type Props = {
  row: RecipientRow;
  /** 1 = texted first. */
  position: number;
  count: number;
  nameError?: string;
  phoneError?: string;
  onChange: (changes: RowChanges) => void;
  onKindChange: (kind: RecipientKind) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onDone: () => void;
};

export function RecipientEditor({
  row,
  position,
  count,
  nameError,
  phoneError,
  onChange,
  onKindChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDone,
}: Props) {
  const which = `recipient ${position}`;
  return (
    <View style={styles.card} testID={`recipient-editor-${position}`}>
      <View style={styles.header}>
        <Avatar index={position - 1} />
        <Text accessibilityRole="header" style={[TEXT.cardTitle, styles.title]}>
          {`${kindWord(row.kind)} ${position}`}
        </Text>
        <SmallButton label="Done" accessibilityLabel={`Done with ${which}`} onPress={onDone} />
      </View>
      <TextField
        accessibilityLabel={`Name, ${which}`}
        autoCapitalize="words"
        error={nameError}
        label="Name"
        maxLength={MAX_NAME_LENGTH}
        onChangeText={(name) => onChange({ name })}
        placeholder={row.kind === 'venueStaff' ? 'e.g. Main stage medical' : 'e.g. Maya Chen'}
        textContentType="name"
        value={row.name}
      />
      <TextField
        accessibilityLabel={`Phone, ${which}`}
        error={phoneError}
        keyboardType="phone-pad"
        label="Phone"
        onChangeText={(phone) => onChange({ phone })}
        placeholder="e.g. 403 555 0142"
        textContentType="telephoneNumber"
        value={row.phone}
      />
      <Segmented
        accessibilityLabel={`Who ${which} is`}
        onChange={onKindChange}
        options={KIND_OPTIONS.map((option) => ({ ...option, accessibilityLabel: `${option.label}, ${which}` }))}
        value={row.kind}
      />
      <View style={styles.actions}>
        {position > 1 && <SmallButton label="Move up" accessibilityLabel={`Move ${which} up`} onPress={onMoveUp} />}
        {position < count && <SmallButton label="Move down" accessibilityLabel={`Move ${which} down`} onPress={onMoveDown} />}
        <View style={styles.spacer} />
        <SmallButton label="Remove" accessibilityLabel={`Remove ${which}`} onPress={onRemove} tone="coral" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: RADII.row,
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
    backgroundColor: PALETTE.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  title: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
  spacer: { flex: 1 },
});
