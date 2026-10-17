import { useEffect } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { InfoCallout, TEXT } from '../ui';

// The Debug panel's one notice or error line (K11), under the header. The panel scrolls, so
// whatever lands here is also announced: a VoiceOver user firing scenario 7 at the bottom
// still hears "Scenario 7 (Privacy) fired. …" or why it didn't.

type Props = {
  error: string | null;
  notice: string | null;
};

export function StatusLine({ error, notice }: Props) {
  const message = error ?? notice;

  useEffect(() => {
    if (message !== null) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  if (error !== null) {
    return (
      <InfoCallout variant="card" tone="alert" icon="warning">
        <Text style={TEXT.error}>{error}</Text>
      </InfoCallout>
    );
  }
  if (notice !== null) {
    return (
      <InfoCallout variant="card" tone="info" icon="info">
        {notice}
      </InfoCallout>
    );
  }
  return null;
}
