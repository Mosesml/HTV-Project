import { StyleSheet, Text, View } from 'react-native';

import type { RecipientPermissions } from '../../modules/raveguard-native';
import { Avatar, Card, PALETTE, SPACE, TEXT, Toggle } from '../ui';
import { GRID_COLUMNS, PERMISSION_LINES, shortName, spokenNames } from './permissionPreview';
import type { RecipientRow } from './setupRows';

// Setup step 2's grid (docs/design/screens/Setup-Permissions.html): one column per recipient,
// one row per permission (PermissionSet). "Get alerts" is locked on. Three columns fit a phone,
// so a longer chain gets a second grid underneath. Every switch is named "Maya: see location".

const COLUMN_WIDTH = 56;

type Props = {
  /** The recipients being saved (blank rows left out), in texting order. */
  rows: readonly RecipientRow[];
  onChange: (id: string, permission: keyof RecipientPermissions, value: boolean) => void;
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
}

export function PermissionGrid({ rows, onChange }: Props) {
  const names = spokenNames(rows);
  const columns = rows.map((row, index) => ({ row, index, spoken: names[index] }));
  return (
    <View style={styles.grids}>
      {chunk(columns, GRID_COLUMNS).map((group) => (
        <Card key={group[0].row.id} padding="none" style={styles.card}>
          <View style={[styles.line, styles.divider, styles.headerLine]}>
            <View style={styles.label} />
            {group.map(({ row, index }) => (
              <View key={row.id} style={styles.column} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Avatar index={index} name={row.name || shortName(row)} size={30} variant="letter" />
                <Text numberOfLines={1} style={TEXT.small}>
                  {shortName(row)}
                </Text>
              </View>
            ))}
          </View>
          {PERMISSION_LINES.map((line, lineIndex) => (
            <View key={line.key} style={[styles.line, lineIndex < PERMISSION_LINES.length - 1 && styles.divider]}>
              <View style={styles.label}>
                <Text style={TEXT.label}>{line.title}</Text>
                <Text style={TEXT.small}>{line.subtitle}</Text>
              </View>
              {group.map(({ row, spoken }) => (
                <View key={row.id} style={styles.column}>
                  <Toggle
                    accessibilityLabel={`${spoken}: ${line.title.toLowerCase()}`}
                    isLocked={line.isLocked}
                    onValueChange={(value) => onChange(row.id, line.key, value)}
                    value={line.isLocked || row.permissions[line.key]}
                  />
                </View>
              ))}
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grids: { gap: SPACE.md },
  card: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, paddingBottom: SPACE.xs },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md },
  headerLine: { paddingTop: SPACE.sm, paddingBottom: SPACE.md },
  divider: { borderBottomWidth: 1, borderBottomColor: PALETTE.border },
  label: { flex: 1, gap: SPACE.xxs, paddingRight: SPACE.xs },
  column: { width: COLUMN_WIDTH, alignItems: 'center', gap: SPACE.xs },
});
