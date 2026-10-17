import { StyleSheet } from 'react-native';

/** PRD UI-7: every tap target on the session screens is at least 60 pt. */
export const MIN_TAP_TARGET = 60;

export const COLORS = {
  primary: '#208AEF',
  danger: '#C62828',
  /** An acknowledged alert (Alert screen, K10); 5.9:1 on white. */
  success: '#1B7A3D',
  muted: '#6B7280',
  onPrimary: '#FFFFFF',
  disabled: '#9CA3AF',
  border: '#9CA3AF',
  card: '#F3F4F6',
  nightBackground: '#0B0F1A',
  nightText: '#F5F7FA',
  /** Secondary text on the night background (about 10:1). */
  nightMuted: '#B4BCCB',
  /** Unlit countdown ticks: faint on purpose (1.5:1); the seconds in the ring carry the time. */
  nightDim: '#2A3447',
  /** Countdown ring colors per check-in stage, each at least 7:1 on the night background. */
  stageWhisper: '#7CB8FF',
  stageLoud: '#FFC94D',
  stagePinGate: '#FF8A8A',
  /** Errors on the night background (the light-screen red is too dark there). */
  nightDanger: '#FF9B9B',
} as const;

/** The Check-in screen's big thumb button (PRD UI-3: at least 60 pt; twice that here). */
export const CHECK_IN_BUTTON_HEIGHT = 120;

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
