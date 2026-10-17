import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PIN_MAX_LENGTH } from '../pin/pinRules';
import { FormField } from '../ui/FormField';
import { ToggleRow } from '../ui/ToggleRow';
import { TYPE } from '../ui/theme';

// Both PINs (K5). Hidden by default, with Show PINs so the wearer can check them before
// saving: there is no confirm field, to keep setup under a minute.

type Props = {
  safePin: string;
  duressPin: string;
  /** PINs are already stored, so leaving both blank keeps them. */
  hasPins: boolean;
  safeError?: string;
  duressError?: string;
  onChange: (changes: { safePin?: string; duressPin?: string }) => void;
};

const PIN_INPUT = { autoComplete: 'off', keyboardType: 'number-pad', maxLength: PIN_MAX_LENGTH } as const;

export function PinFields({ safePin, duressPin, hasPins, safeError, duressError, onChange }: Props) {
  const [isShown, setIsShown] = useState(false);
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.heading}>
        Your two PINs
      </Text>
      <Text style={TYPE.label}>
        The safe PIN cancels a check-in. The duress PIN looks exactly the same on this phone, but quietly tells
        Contact 1 you need help. They must be different.
      </Text>
      {hasPins && <Text style={TYPE.body}>Leave both PINs blank to keep the ones you set.</Text>}
      <FormField
        {...PIN_INPUT}
        error={safeError}
        label="Safe PIN"
        onChangeText={(text) => onChange({ safePin: text })}
        secureTextEntry={!isShown}
        value={safePin}
      />
      <FormField
        {...PIN_INPUT}
        error={duressError}
        label="Duress PIN"
        onChangeText={(text) => onChange({ duressPin: text })}
        secureTextEntry={!isShown}
        value={duressPin}
      />
      <ToggleRow label="Show PINs" onValueChange={setIsShown} value={isShown} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  heading: { ...TYPE.body, fontWeight: '700' },
});
