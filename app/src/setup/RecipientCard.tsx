import { StyleSheet, Text, View } from 'react-native';

import type { RecipientKind, RecipientPermissions } from '../../modules/raveguard-native';
import { MAX_NAME_LENGTH } from '../settings/defaults';
import { PERMISSION_KEYS, PERMISSION_LABELS } from '../settings/describeSettings';
import { ChipButton } from '../ui/ChipButton';
import { FormField } from '../ui/FormField';
import { ToggleRow } from '../ui/ToggleRow';
import { COLORS, TYPE } from '../ui/theme';
import type { RecipientRow, RowChanges } from './setupRows';

// One recipient in the setup form (K5): name, phone and the four permissions (PRD PRV-3).
// Every control is labelled with the recipient's place in the texting order ("Phone,
// recipient 2"), so VoiceOver users know which row they are in.

const KIND_TITLES: Record<RecipientKind, string> = { contact: 'Contact', venueStaff: 'Venue staff' };

type Props = {
  row: RecipientRow;
  /** 1 = texted first. */
  position: number;
  nameError?: string;
  phoneError?: string;
  onChange: (changes: RowChanges) => void;
  onPermissionChange: (permission: keyof RecipientPermissions, value: boolean) => void;
  onMoveUp: () => void;
  onRemove: () => void;
};

export function RecipientCard({
  row,
  position,
  nameError,
  phoneError,
  onChange,
  onPermissionChange,
  onMoveUp,
  onRemove,
}: Props) {
  const which = `recipient ${position}`;
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>{`${position}. ${KIND_TITLES[row.kind]}`}</Text>
      <FormField
        accessibilityLabel={`Name, ${which}`}
        autoCapitalize="words"
        error={nameError}
        label="Name"
        maxLength={MAX_NAME_LENGTH}
        onChangeText={(name) => onChange({ name })}
        textContentType="name"
        value={row.name}
      />
      <FormField
        accessibilityLabel={`Phone, ${which}`}
        error={phoneError}
        keyboardType="phone-pad"
        label="Phone"
        onChangeText={(phone) => onChange({ phone })}
        textContentType="telephoneNumber"
        value={row.phone}
      />
      {PERMISSION_KEYS.map((key) => (
        <ToggleRow
          accessibilityLabel={`${PERMISSION_LABELS[key]}, ${which}`}
          key={key}
          label={PERMISSION_LABELS[key]}
          onValueChange={(value) => onPermissionChange(key, value)}
          value={row.permissions[key]}
        />
      ))}
      <View style={styles.actions}>
        {position > 1 && <ChipButton accessibilityLabel={`Move ${which} up`} label="Move up" onPress={onMoveUp} />}
        <ChipButton accessibilityLabel={`Remove ${which}`} label="Remove" onPress={onRemove} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: COLORS.card },
  title: { ...TYPE.body, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
});
