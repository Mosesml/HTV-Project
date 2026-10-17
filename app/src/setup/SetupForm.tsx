import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { RecipientKind, RecipientPermissions, Settings } from '../../modules/raveguard-native';
import { usePins } from '../pin/PinStoreProvider';
import { errorMessage } from '../session/describe';
import { MAX_NAME_LENGTH, MAX_SELF_DESCRIPTION_LENGTH } from '../settings/defaults';
import { useSettings } from '../settings/SettingsProvider';
import { ActionButton } from '../ui/ActionButton';
import { ChipButton } from '../ui/ChipButton';
import { ChoiceChips, type Choice } from '../ui/ChoiceChips';
import { FormField } from '../ui/FormField';
import { TYPE } from '../ui/theme';
import { PinFields } from './PinFields';
import { RecipientCard } from './RecipientCard';
import { checkSetup, draftFromSettings, rowFieldKey, type SetupDraft } from './setupDraft';
import { appendRow, moveRowUp, removeRow, setRowPermission, updateRow, type RecipientRow, type RowChanges } from './setupRows';

// The setup flow (K5, PRD D5 / UI-1): one scrolling form, so scenario 7's setup takes
// under a minute. Saving checks everything first, then saves the settings through K4
// (validate, write the file, configure()) and hands both PINs to the PIN store (K6).

const INTERVAL_CHOICES: readonly Choice<Settings['intervalMin']>[] = [
  { value: 30, label: 'Every 30 min' },
  { value: 60, label: 'Every 60 min' },
];

type Props = {
  /** Called once the settings and PINs are saved. */
  onSaved: () => void;
  /** Shown as a Cancel button when given (there is a saved setup to go back to). */
  onCancel?: () => void;
};

type RowsChange = (rows: readonly RecipientRow[]) => readonly RecipientRow[];

export function SetupForm({ onSaved, onCancel }: Props) {
  const { settings, source, save } = useSettings();
  const { hasPins, savePins } = usePins();
  const [draft, setDraft] = useState<SetupDraft>(() => draftFromSettings(settings, { isSaved: source === 'saved' }));
  const [hasTriedSave, setHasTriedSave] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const check = checkSetup(draft, settings, { hasPins });
  const errors = hasTriedSave && !check.ok ? check.errors : {};

  const change = (changes: Partial<SetupDraft>) => setDraft((current) => ({ ...current, ...changes }));
  const changeRows = (edit: RowsChange) => setDraft((current) => ({ ...current, recipients: edit(current.recipients) }));

  const handleSave = async () => {
    setHasTriedSave(true);
    setSaveError(null);
    if (!check.ok) return;
    setIsSaving(true);
    try {
      await save(check.settings);
      if (check.pins) await savePins(check.pins);
      onSaved();
    } catch (error: unknown) {
      setSaveError(errorMessage(error));
      setIsSaving(false);
    }
  };

  const rowHandlers = (row: RecipientRow) => ({
    onChange: (changes: RowChanges) => changeRows((rows) => updateRow(rows, row.id, changes)),
    onPermissionChange: (key: keyof RecipientPermissions, value: boolean) =>
      changeRows((rows) => setRowPermission(rows, row.id, key, value)),
    onMoveUp: () => changeRows((rows) => moveRowUp(rows, row.id)),
    onRemove: () => changeRows((rows) => removeRow(rows, row.id)),
  });
  const addRow = (kind: RecipientKind) => changeRows((rows) => appendRow(rows, kind));

  return (
    <View style={styles.form}>
      <FormField
        autoCapitalize="words"
        error={errors.wearerName}
        label="Your name"
        maxLength={MAX_NAME_LENGTH}
        onChangeText={(wearerName) => change({ wearerName })}
        textContentType="name"
        value={draft.wearerName}
      />

      <Text accessibilityRole="header" style={styles.heading}>
        Who to text, in order
      </Text>
      <Text style={TYPE.label}>Contact 1 is texted first. Leave a row empty to skip it.</Text>
      {draft.recipients.map((row, index) => (
        <RecipientCard
          key={row.id}
          nameError={errors[rowFieldKey(row.id, 'name')]}
          phoneError={errors[rowFieldKey(row.id, 'phone')]}
          position={index + 1}
          row={row}
          {...rowHandlers(row)}
        />
      ))}
      {errors.recipients !== undefined && <Text style={TYPE.error}>{errors.recipients}</Text>}
      <View style={styles.addRow}>
        <ChipButton label="Add contact" onPress={() => addRow('contact')} />
        <ChipButton label="Add venue staff" onPress={() => addRow('venueStaff')} />
      </View>

      <Text accessibilityRole="header" style={styles.heading}>
        Check-ins
      </Text>
      <ChoiceChips choices={INTERVAL_CHOICES} onSelect={(intervalMin) => change({ intervalMin })} selected={draft.intervalMin} />
      <FormField
        error={errors.loudnessTarget}
        hint="The in-ear level RaveGuard keeps you under. 85 dB is the usual safe limit."
        keyboardType="number-pad"
        label="Loudness target in dB"
        maxLength={3}
        onChangeText={(loudnessTarget) => change({ loudnessTarget })}
        value={draft.loudnessTarget}
      />
      <FormField
        error={errors.selfDescription}
        hint="Venue staff use this to find you: clothes, hair, where you'll be. Optional."
        label="About you"
        maxLength={MAX_SELF_DESCRIPTION_LENGTH}
        multiline
        onChangeText={(selfDescription) => change({ selfDescription })}
        value={draft.selfDescription}
      />

      <PinFields
        duressError={errors.duressPin}
        duressPin={draft.duressPin}
        hasPins={hasPins}
        onChange={change}
        safeError={errors.safePin}
        safePin={draft.safePin}
      />

      {errors.form !== undefined && <Text style={TYPE.error}>{errors.form}</Text>}
      {hasTriedSave && !check.ok && <Text style={TYPE.error}>Fix the fields marked in red, then save again.</Text>}
      {saveError !== null && <Text style={TYPE.error}>{saveError}</Text>}
      <ActionButton isDisabled={isSaving} label={isSaving ? 'Saving…' : 'Save setup'} onPress={handleSave} />
      {onCancel !== undefined && <ActionButton label="Cancel" onPress={onCancel} variant="secondary" />}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  heading: { ...TYPE.body, fontWeight: '700', marginTop: 8 },
  addRow: { flexDirection: 'row', gap: 8 },
});
