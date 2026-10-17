import { View } from 'react-native';

import { PALETTE } from './theme';

/** `ok` mint (connected, live), `off` faint, `warning` amber, `alert` coral. */
export type StatusTone = 'ok' | 'off' | 'warning' | 'alert';

export const STATUS_DOT_COLORS: Record<StatusTone, string> = {
  ok: PALETTE.mint,
  off: PALETTE.textFaint,
  warning: PALETTE.amber,
  alert: PALETTE.coral,
};

type Props = {
  tone: StatusTone;
  /** 10 (Home rows), 8 or 9 (pills, tiles). */
  size?: number;
  testID?: string;
};

/** A small coloured dot. Decorative: the text next to it says the status (colour is never the only cue). */
export function StatusDot({ tone, size = 10, testID }: Props) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID ?? `status-dot-${tone}`}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: STATUS_DOT_COLORS[tone], flexShrink: 0 }}
    />
  );
}
