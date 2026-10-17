import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { COLORS, TYPE } from './theme';

type Props = Pick<
  TextInputProps,
  'autoCapitalize' | 'autoComplete' | 'keyboardType' | 'maxLength' | 'multiline' | 'secureTextEntry' | 'textContentType'
> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** What VoiceOver (and tests) call the field; defaults to `label`. */
  accessibilityLabel?: string;
  hint?: string;
  error?: string;
};

/** A labelled text field with an optional hint and an error line under it. */
export function FormField({ label, value, onChangeText, accessibilityLabel, hint, error, ...inputProps }: Props) {
  return (
    <View style={styles.field}>
      <Text style={TYPE.label}>{label}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={hint}
        onChangeText={onChangeText}
        style={[styles.input, inputProps.multiline && styles.multiline, error !== undefined && styles.invalid]}
        value={value}
      />
      {hint !== undefined && <Text style={TYPE.label}>{hint}</Text>}
      {error !== undefined && <Text style={TYPE.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    fontSize: 17,
  },
  multiline: { minHeight: 72, paddingVertical: 10, textAlignVertical: 'top' },
  invalid: { borderColor: COLORS.danger, borderWidth: 2 },
});
