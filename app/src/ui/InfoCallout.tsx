import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { ICON, PALETTE, RADII, TEXT } from './theme';

/** The accent for the icon and the title: blue (info), amber (warning, a trigger), coral (alert), sos. */
export type CalloutTone = 'info' | 'warning' | 'alert' | 'sos';
/** `sunken`: borderless dark fill (most callouts); `card`: surface with a border (the trigger on loud Check-in). */
export type CalloutVariant = 'sunken' | 'card';

type Props = {
  /** The body text, or any content. */
  children: ReactNode;
  /** A short heading. In `sunken` callouts it is an uppercase overline ("WHAT THEO WOULD GET"); in `card` a bold line ("Looked like a fall"). */
  title?: string;
  icon?: IconName;
  tone?: CalloutTone;
  variant?: CalloutVariant;
  testID?: string;
};

const ACCENTS: Record<CalloutTone, string> = {
  info: PALETTE.blue,
  warning: PALETTE.amber,
  alert: PALETTE.coral,
  sos: PALETTE.coral,
};

const BACKGROUNDS: Record<CalloutVariant | 'sos', object> = {
  sunken: { backgroundColor: PALETTE.surfaceSunken },
  card: { backgroundColor: PALETTE.surface, borderWidth: 1, borderColor: PALETTE.border },
  sos: { backgroundColor: PALETTE.sosSurface },
};

/** A note with an optional icon and title: setup hints, the Summary, the check-in trigger, SOS's "Read this out". */
export function InfoCallout({ children, title, icon, tone = 'info', variant = 'sunken', testID }: Props) {
  const accent = ACCENTS[tone];
  const background = tone === 'sos' ? BACKGROUNDS.sos : BACKGROUNDS[variant];
  const isCard = variant === 'card';
  const titleStyle = isCard
    ? TEXT.label
    : [TEXT.overline, styles.overline, { color: tone === 'sos' ? PALETTE.sosTextMuted : accent }];
  return (
    <View accessible testID={testID} style={[styles.callout, background, isCard && styles.cardPadding]}>
      {icon !== undefined && (
        <View style={styles.icon}>
          <Icon name={icon} size={ICON.sizeTiny} color={accent} />
        </View>
      )}
      <View style={styles.body}>
        {title !== undefined && <Text style={titleStyle}>{title}</Text>}
        {typeof children === 'string' ? <Text style={isCard ? TEXT.caption : styles.text}>{children}</Text> : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  callout: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: RADII.field, paddingVertical: 14, paddingHorizontal: 16 },
  cardPadding: { paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  icon: { paddingTop: 1 },
  body: { flex: 1, gap: 6 },
  overline: { fontSize: 12, fontFamily: TEXT.smallStrong.fontFamily },
  text: { ...TEXT.caption, color: PALETTE.textMuted },
});
