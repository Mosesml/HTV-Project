import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Icon, ICON, ListRow, PALETTE, SPACE, TEXT } from '../ui';
import type { AlertRecipient, RecipientState } from './alertModel';

// One recipient on Alert (docs/design/screens/Alert.html): the letter avatar in texting-order
// colour, the name, when they were texted (or why not yet), and a status word on the right.

const STATUS_COLORS: Record<RecipientState, string> = {
  onIt: PALETTE.mint,
  noReply: PALETTE.amber,
  notTexted: PALETTE.textFaint,
};

function StatusWord({ state, label }: { state: RecipientState; label: string }) {
  const color = STATUS_COLORS[state];
  return (
    <View style={styles.status}>
      {state === 'onIt' && <Icon name="check" size={ICON.sizeTiny} color={color} />}
      <Text style={[state === 'notTexted' ? styles.faintWord : TEXT.captionStrong, { color }]}>{label}</Text>
    </View>
  );
}

type Props = {
  recipient: AlertRecipient;
  isLast: boolean;
};

export function RecipientRow({ recipient, isLast }: Props) {
  return (
    <ListRow
      leading={<Avatar index={recipient.index} variant="letter" name={recipient.name} />}
      title={recipient.name}
      subtitle={recipient.detail}
      trailing={<StatusWord state={recipient.state} label={recipient.statusLabel} />}
      hasDivider={!isLast}
      accessibilityLabel={recipient.accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, flexShrink: 0 },
  // The mockup sets "Not texted" a weight lighter than the other status words.
  faintWord: { ...TEXT.captionStrong, fontFamily: TEXT.label.fontFamily },
});
