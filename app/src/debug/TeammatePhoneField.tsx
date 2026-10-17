import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '../session/describe';
import { useSettings } from '../settings/SettingsProvider';
import { parseTeammatePhone } from '../settings/teammatePhone';
import { E164_PATTERN } from '../settings/validateSettings';
import { ActionButton } from '../ui/ActionButton';
import { FormField } from '../ui/FormField';

// The teammate's number the Alert screen's Call rings in demo mode (K10, PRD DEM-1). It sits
// on the Debug screen with the other demo tools; the Setup form leaves it out (K5).
// Saving goes through useSettings().save, so it is validated, written and sent through
// configure(). The field starts from the saved number, so the Debug screen remounts it (a
// `key`) when that number changes; for the same reason the "saved" notice is the parent's.

const FORMAT_HINT = 'International format, like +14165550199. Leave blank for none.';
const FORMAT_ERROR = 'Enter the number in international format, like +14165550199 (E.164).';

type Props = {
  /** Called with what to tell the wearer once the number is saved or cleared. */
  onSaved: (notice: string) => void;
};

export function TeammatePhoneField({ onSaved }: Props) {
  const { settings, save } = useSettings();
  const [text, setText] = useState(settings.teammatePhone ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    const teammatePhone = parseTeammatePhone(text);
    if (teammatePhone !== null && !E164_PATTERN.test(teammatePhone)) {
      setError(FORMAT_ERROR);
      return;
    }
    save({ ...settings, teammatePhone })
      .then(() => onSaved(teammatePhone === null ? "Teammate's number cleared" : "Teammate's number saved"))
      .catch((e: unknown) => setError(errorMessage(e)));
  };

  return (
    <View style={styles.group}>
      <FormField
        label="Teammate's number"
        hint={FORMAT_HINT}
        value={text}
        onChangeText={setText}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        error={error ?? undefined}
      />
      <ActionButton label="Save teammate's number" variant="secondary" onPress={handleSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
});
