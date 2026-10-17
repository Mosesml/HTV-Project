import { StyleSheet, Text, View } from 'react-native';

import { StatusDot, type StatusTone } from './StatusDot';
import { PALETTE, RADII, TEXT } from './theme';

/**
 * `live`: surface with a mint dot ("Session live 1h 42m"); `alert`: coral on coral-soft
 * ("Alert sent · 01:47", "SOS"); `warning`: amber on amber-soft ("Simulated"); `neutral`.
 */
export type PillTone = 'live' | 'alert' | 'warning' | 'neutral';

type Props = {
  label: string;
  tone?: PillTone;
  /** Muted text after the label, in tabular numerals ("1h 42m"). */
  detail?: string;
  /** Draws the leading dot. Default true except for `warning`. */
  hasDot?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

const TONES: Record<PillTone, { background: string; border?: string; text: string; dot: StatusTone }> = {
  live: { background: PALETTE.surface, border: PALETTE.border, text: PALETTE.text, dot: 'ok' },
  alert: { background: PALETTE.coralSoft, text: PALETTE.coral, dot: 'alert' },
  warning: { background: PALETTE.amberSoft, text: PALETTE.amber, dot: 'warning' },
  neutral: { background: PALETTE.surface2, text: PALETTE.textMuted, dot: 'off' },
};

/** A rounded status label. One VoiceOver element. */
export function StatusPill({ label, tone = 'neutral', detail, hasDot, accessibilityLabel, testID }: Props) {
  const colors = TONES[tone];
  const showDot = hasDot ?? tone !== 'warning';
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? [label, detail].filter(Boolean).join(', ')}
      testID={testID}
      style={[
        styles.pill,
        { backgroundColor: colors.background },
        colors.border !== undefined && { borderWidth: 1, borderColor: colors.border },
        tone === 'live' && styles.livePadding,
      ]}>
      {showDot && <StatusDot tone={colors.dot} size={tone === 'live' ? 9 : 8} />}
      <Text style={[tone === 'live' ? TEXT.label : TEXT.captionStrong, { color: colors.text }]}>{label}</Text>
      {detail !== undefined && <Text style={[TEXT.labelNumeric, styles.detail]}>{detail}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: RADII.pill,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  livePadding: { paddingVertical: 8, paddingLeft: 12, paddingRight: 14, gap: 10 },
  detail: { color: PALETTE.textMuted, fontFamily: TEXT.label.fontFamily },
});
