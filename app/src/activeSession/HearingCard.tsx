import { StyleSheet, Text, View } from 'react-native';

import type { HearingEvent } from '../../modules/raveguard-native';
import { Card, MetricTile, PALETTE, ProgressBar, SPACE, TEXT } from '../ui';
import { ProtectionControl } from './ProtectionControl';
import { doseFraction, doseSpoken, floorLine, formatDose, inEarDbValue, roomDbValue } from './readings';

/** The mockup's gap between the Hearing card's sections. */
const CARD_GAP = 18;

type Props = {
  /** From `onHearing` or the snapshot; null (and its fields null) until automatic protection (BL1) lands. */
  hearing: HearingEvent | null;
  /** The protection level Swift reported; null until it has. */
  level: number | null;
  sliderLevel: number;
  onLevelChange: (value: number) => void;
};

/**
 * The Hearing card: room and in-ear dB, tonight's dose with its bar and floor line, and the
 * protection slider. Every reading shows "—" while it is null (README rule 3); the slider
 * keeps working regardless.
 *
 * The contract has no in-ear level or protection floor yet (see docs/overnight/UI-active.md),
 * so those two are always "—" for now.
 */
export function HearingCard({ hearing, level, sliderLevel, onLevelChange }: Props) {
  const dosePercent = hearing?.dosePercent ?? null;
  return (
    <Card gap={CARD_GAP}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={TEXT.cardTitle}>
          Hearing
        </Text>
        <Text style={TEXT.small}>Estimates, not a medical reading</Text>
      </View>
      <View style={styles.tiles}>
        <MetricTile label="Room" value={roomDbValue(hearing?.roomDb ?? null)} unit="dB" />
        <MetricTile label="In your ears" value={inEarDbValue(null)} unit="dB" valueColor={PALETTE.blue} />
      </View>
      <View style={styles.block}>
        <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text style={TEXT.label}>Tonight&apos;s dose</Text>
          <Text style={TEXT.labelNumeric}>{formatDose(dosePercent)}</Text>
        </View>
        <ProgressBar
          fraction={doseFraction(dosePercent)}
          accessibilityLabel="Tonight's dose (estimate)"
          valueText={doseSpoken(dosePercent)}
        />
        <Text style={TEXT.small}>{floorLine(null)}</Text>
      </View>
      <ProtectionControl level={level} sliderLevel={sliderLevel} onChange={onLevelChange} />
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
  tiles: { flexDirection: 'row', gap: SPACE.sm + SPACE.xxs },
  block: { gap: SPACE.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
