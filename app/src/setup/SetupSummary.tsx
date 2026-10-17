import { StyleSheet, Text, View } from 'react-native';

import type { Settings } from '../../modules/raveguard-native';
import { describePermissions, describeRecipientLine, describeTimings } from '../settings/describeSettings';
import { TYPE } from '../ui/theme';

type Props = {
  settings: Settings;
  hasPins: boolean;
};

/** The saved setup, read-only: who is texted, what each may do, timings and whether PINs are set. */
export function SetupSummary({ settings, hasPins }: Props) {
  return (
    <View style={styles.summary}>
      <Text style={TYPE.label}>Saved settings</Text>
      <Text style={TYPE.value}>{`Wearer: ${settings.wearerName}`}</Text>
      <Text style={TYPE.value}>{describeTimings(settings)}</Text>
      {settings.recipients.length === 0 ? (
        <Text style={TYPE.value}>No one to text yet</Text>
      ) : (
        settings.recipients.map((recipient) => (
          <View key={recipient.id}>
            <Text style={TYPE.value}>{describeRecipientLine(recipient)}</Text>
            <Text style={TYPE.label}>{describePermissions(recipient.permissions)}</Text>
          </View>
        ))
      )}
      <Text style={hasPins ? TYPE.value : TYPE.error}>
        {hasPins ? 'Safe and duress PINs set' : 'PINs not set: tap Edit setup to add them.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 4, paddingVertical: 8 },
});
