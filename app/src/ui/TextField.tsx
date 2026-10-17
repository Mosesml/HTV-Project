import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { FONTS, PALETTE, RADII, TEXT } from './theme';

type Props = Pick<
  TextInputProps,
  | 'autoCapitalize'
  | 'autoComplete'
  | 'autoCorrect'
  | 'keyboardType'
  | 'maxLength'
  | 'multiline'
  | 'onBlur'
  | 'onSubmitEditing'
  | 'placeholder'
  | 'returnKeyType'
  | 'secureTextEntry'
  | 'textContentType'
> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** A muted word after the label, e.g. "optional". Shown as "(optional)". */
  tag?: string;
  /** A line under the field ("Helps a friend spot you in a crowd."). */
  helper?: string;
  /** Replaces the helper and turns the border coral. */
  error?: string;
  /** What VoiceOver (and tests) call the field; defaults to `label`. */
  accessibilityLabel?: string;
  testID?: string;
};

/** A labelled dark text field: label (+ optional tag), the 52 pt input, then a helper or an error. */
export function TextField({ label, value, onChangeText, tag, helper, error, accessibilityLabel, testID, ...inputProps }: Props) {
  const [isFocused, setIsFocused] = useState(false);
  const hasError = error !== undefined;
  return (
    <View style={styles.field}>
      <Text style={TEXT.label}>
        {label}
        {tag !== undefined && <Text style={styles.tag}>{` (${tag})`}</Text>}
      </Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={hasError ? error : helper}
        keyboardAppearance="dark"
        onBlur={(event) => {
          setIsFocused(false);
          inputProps.onBlur?.(event);
        }}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        placeholderTextColor={PALETTE.textFaint}
        selectionColor={PALETTE.lavender}
        style={[
          styles.input,
          inputProps.multiline && styles.multiline,
          isFocused && styles.focused,
          hasError && styles.invalid,
        ]}
        testID={testID}
        value={value}
      />
      {hasError ? (
        <Text accessibilityLiveRegion="polite" style={TEXT.error}>
          {error}
        </Text>
      ) : (
        helper !== undefined && <Text style={TEXT.small}>{helper}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  tag: { fontFamily: FONTS.manropeMedium, color: PALETTE.textMuted },
  input: {
    minHeight: 52,
    borderRadius: RADII.field,
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
    backgroundColor: PALETTE.surface,
    color: PALETTE.text,
    fontFamily: FONTS.manropeRegular,
    fontSize: 16,
    paddingHorizontal: 16,
  },
  multiline: { minHeight: 88, paddingVertical: 14, textAlignVertical: 'top' },
  focused: { borderColor: PALETTE.lavender },
  invalid: { borderColor: PALETTE.coral, borderWidth: 2 },
});
