import { StyleSheet } from 'react-native';

/** PRD UI-7: every tap target on the session screens is at least 60 pt. */
export const MIN_TAP_TARGET = 60;

export const COLORS = {
  primary: '#208AEF',
  danger: '#C62828',
  muted: '#6B7280',
  onPrimary: '#FFFFFF',
  disabled: '#9CA3AF',
  nightBackground: '#0B0F1A',
  nightText: '#F5F7FA',
} as const;

export const SPACING = { gutter: 24, gap: 12 } as const;

export const TYPE = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 17 },
  label: { fontSize: 13, color: COLORS.muted },
  value: { fontSize: 17, fontVariant: ['tabular-nums'] },
  error: { fontSize: 15, color: COLORS.danger },
});

export const LAYOUT = StyleSheet.create({
  screen: { flexGrow: 1, padding: SPACING.gutter, gap: SPACING.gap },
});
