import { Text } from 'react-native';

import { TEXT } from './theme';

/** `overline`: uppercase muted ("RIGHT NOW", "SCHEDULED CHECK-IN"); `title`: a bold 14 pt heading ("Timings", "Fire a scenario"). */
export type SectionLabelVariant = 'overline' | 'title';

type Props = {
  children: string;
  variant?: SectionLabelVariant;
  color?: string;
  testID?: string;
};

/** A section heading. VoiceOver treats it as a header, so the rotor can jump between sections. */
export function SectionLabel({ children, variant = 'overline', color, testID }: Props) {
  return (
    <Text
      accessibilityRole="header"
      testID={testID}
      style={[variant === 'overline' ? TEXT.overline : TEXT.labelNumeric, color !== undefined && { color }]}>
      {children}
    </Text>
  );
}
