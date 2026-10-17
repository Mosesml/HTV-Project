import { StyleSheet, Text, View } from 'react-native';

import type { PinField } from '../pin/pinRules';
import { Card, IconChip, PALETTE, PinDots, SPACE, TEXT } from '../ui';
import { PIN_PHRASES, PIN_TITLES, type PinCardState } from './pinStep';
import { SmallButton } from './SmallButton';

// One of Setup step 4's two PIN cards (docs/design/screens/Setup-PINs.html): the chip, the
// title, Change, what the PIN does, and dots for whether it is set. Never shows a digit.

const CHIPS: Record<PinField, { icon: 'check' | 'lock'; background: string }> = {
  safePin: { icon: 'check', background: PALETTE.mint },
  duressPin: { icon: 'lock', background: PALETTE.lavender },
};

const CHIP_SIZE = 34;

type Props = {
  field: PinField;
  description: string;
  state: PinCardState;
  error?: string;
  onChange: () => void;
};

export function PinCard({ field, description, state, error, onChange }: Props) {
  const title = PIN_TITLES[field];
  const chip = CHIPS[field];
  return (
    <Card testID={`pin-card-${field}`}>
      <View style={styles.header}>
        <View style={styles.title}>
          <IconChip background={chip.background} color={PALETTE.onLavender} icon={chip.icon} size={CHIP_SIZE} />
          <Text accessibilityRole="header" style={TEXT.cardTitle}>
            {title}
          </Text>
        </View>
        <SmallButton
          accessibilityLabel={`${state.isSet ? 'Change' : 'Set'} ${PIN_PHRASES[field]}`}
          label={state.isSet ? 'Change' : 'Set'}
          onPress={onChange}
        />
      </View>
      <Text style={TEXT.body}>{description}</Text>
      <PinDots accessibilityLabel={state.label} filled={state.filled} size="small" />
      {error !== undefined && (
        <Text accessibilityLiveRegion="polite" style={TEXT.error}>
          {error}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
});
