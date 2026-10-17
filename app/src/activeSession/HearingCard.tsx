import { StyleSheet, Text, View } from 'react-native';

import type { HearingEvent, ProtectionMode } from '../../modules/raveguard-native';
import { Card, MetricTile, PALETTE, ProgressBar, SPACE, TEXT } from '../ui';
import { AutoProtectionRow } from './AutoProtectionRow';
import { ProtectionControl } from './ProtectionControl';
import { doseFraction, doseSpoken, floorLine, formatDose, inEarDbValue, roomDbValue } from './readings';

/** The mockup's gap between the Hearing card's sections. */
const CARD_GAP = 18;

/** The Automatic / Manual choice (BL1), from useAutoProtection. */
export type AutomaticControl = {
  mode: ProtectionMode;
  hint: string;
  isSwitching: boolean;
  onChange: (isAuto: boolean) => void;
};

type Props = {
  /** From `onHearing` or the snapshot; null (and its readings null) until a level source reports. */
  hearing: HearingEvent | null;
  /** The protection level Swift reported; null until it has. */
  level: number | null;
  sliderLevel: number;
  onLevelChange: (value: number) => void;
  /** Leave out to hide the Automatic / Manual choice. */
  automatic?: AutomaticControl;
};

/**
 * The Hearing card: room and in-ear dB, tonight's dose with its bar and floor line, the
 * Automatic / Manual choice and the protection slider. Every reading shows "—" while it is null
 * (README rule 3); the slider keeps working regardless.
 */
export function HearingCard({ hearing, level, sliderLevel, onLevelChange, automatic }: Props) {
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
        <MetricTile label="In your ears" value={inEarDbValue(hearing?.inEarDb ?? null)} unit="dB" valueColor={PALETTE.blue} />
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
        <Text style={TEXT.small}>{floorLine(hearing?.floorLevel ?? null)}</Text>
      </View>
      {automatic && (
        <AutoProtectionRow
          mode={automatic.mode}
          hint={automatic.hint}
          isSwitching={automatic.isSwitching}
          onChange={automatic.onChange}
        />
      )}
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
