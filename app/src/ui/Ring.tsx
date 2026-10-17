import Svg, { Circle } from 'react-native-svg';

import { PALETTE } from './theme';

type Props = {
  size: number;
  strokeWidth: number;
  /** Share of the ring drawn, 0 to 1, clockwise from 12 o'clock. */
  fraction: number;
  color: string;
  trackColor?: string;
  testID?: string;
};

export function clampFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}

/**
 * A static progress ring (react-native-svg): a track and an arc. Decorative; CountdownRing
 * wraps it with the seconds and the VoiceOver value, and Cancelling… uses it on its own.
 */
export function Ring({ size, strokeWidth, fraction, color, trackColor = PALETTE.surface2, testID }: Props) {
  const centre = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = clampFraction(fraction);
  return (
    <Svg
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      testID={testID}>
      <Circle cx={centre} cy={centre} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      {shown > 0 && (
        <Circle
          testID={testID ? `${testID}-arc` : undefined}
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - shown)}
          transform={`rotate(-90 ${centre} ${centre})`}
        />
      )}
    </Svg>
  );
}
