import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { ICONS, type IconName, type IconShape } from './icons';
import { ICON, PALETTE } from './theme';

type Props = {
  name: IconName;
  /** Width and height in points; the viewBox stays 24. */
  size?: number;
  color?: string;
  testID?: string;
};

function Shape({ shape, color }: { shape: IconShape; color: string }) {
  switch (shape.kind) {
    case 'path':
      return <Path d={shape.d} fill="none" />;
    case 'circle':
      return shape.isFilled ? (
        <Circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={color} stroke="none" />
      ) : (
        <Circle cx={shape.cx} cy={shape.cy} r={shape.r} fill="none" />
      );
    case 'rect':
      return <Rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} fill="none" />;
  }
}

/**
 * One stroke icon from the set in icons.ts: 24 viewBox, 1.8 stroke, round caps and joins.
 * Always decorative: VoiceOver skips it, so the button or row around it carries the label.
 */
export function Icon({ name, size = ICON.size, color = PALETTE.text, testID }: Props) {
  return (
    <Svg
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID ?? `icon-${name}`}
      width={size}
      height={size}
      viewBox={`0 0 ${ICON.viewBox} ${ICON.viewBox}`}
      fill="none"
      stroke={color}
      strokeWidth={ICON.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round">
      {ICONS[name].map((shape, index) => (
        <Shape key={index} shape={shape} color={color} />
      ))}
    </Svg>
  );
}
