import { StyleSheet, type TextStyle } from 'react-native';

import type { CheckInStage } from '../../modules/raveguard-native';

// The design tokens (docs/design/README.md, "Design tokens"). Screens never hard-code a hex
// value, a font name or a size: they use these. The first half is the redesign (dark, Sora /
// Manrope / JetBrains Mono).

// MARK: Colours

/** The wearer app's dark palette: every README token, plus names for the mockups' untokenised colours. */
export const PALETTE = {
  // README tokens.
  bg: '#14122B',
  surface: '#1F1C3D',
  surface2: '#2A2752',
  border: '#2F2B5C',
  borderStrong: '#3B3770',
  text: '#F4F1FF',
  textMuted: '#B7B0DC',
  textFaint: '#8F88BD',
  lavender: '#C9B8FF',
  onLavender: '#1A1638',
  blue: '#A4CCFF',
  mint: '#A6EBCF',
  amber: '#FFC79A',
  coral: '#FFB0A3',
  onCoral: '#2A1218',
  sosBg: '#1E1226',

  // Mockup colours the README left untokenised, named here.
  /** Dashed "Add a contact" border, the Stop session outline. */
  borderEmphasis: '#4A4585',
  /** Info callouts and the phone-side Summary card (no border). */
  surfaceSunken: '#1A1836',
  /** A done step in the check-in StageBar; an empty PIN dot's ring. */
  lavenderDim: '#6E64A8',
  /** A locked-on toggle's track ("Get alerts: always on"). */
  toggleLocked: '#8A7CC4',
  /** A pressed link or ghost button label. */
  lavenderPressed: '#E6DDFF',
  /** The second line on a lavender button ("Cancel the check-in"). */
  onLavenderMuted: '#3A3270',
  /** The second line on a coral button ("Demo: calls a teammate"). */
  onCoralMuted: '#5A2A30',
  /** Alert and SOS pill background (coral text on it). */
  coralSoft: '#3A2333',
  /** "Simulated" tag background (amber text on it). */
  amberSoft: '#2E2A1E',
  /** SOS screen: text, muted text, ring and outline, callout. */
  sosText: '#FFF1F4',
  sosTextMuted: '#D9C3D2',
  sosBorder: '#4A2A3C',
  sosSurface: '#2B1A33',
} as const;

export type PaletteColor = (typeof PALETTE)[keyof typeof PALETTE];

/** The ring, the active StageBar segment and its label, per check-in stage. */
export const STAGE_COLORS: Record<CheckInStage, string> = {
  whisper: PALETTE.lavender,
  loud: PALETTE.amber,
  pinGate: PALETTE.coral,
};

/** StageBar segments that are behind or ahead of the current stage. */
export const STAGE_BAR_COLORS = {
  done: PALETTE.lavenderDim,
  inactive: PALETTE.borderStrong,
  inactiveLabel: PALETTE.textFaint,
} as const;

/** Avatar fills by recipient position (0 = texted first). Everyone from the third on shares the last. */
export const RECIPIENT_COLORS: readonly { background: string; text: string }[] = [
  { background: PALETTE.lavender, text: PALETTE.onLavender },
  { background: PALETTE.blue, text: PALETTE.onLavender },
  { background: PALETTE.surface2, text: PALETTE.lavender },
];

export function recipientColor(index: number): { background: string; text: string } {
  const last = RECIPIENT_COLORS.length - 1;
  return RECIPIENT_COLORS[Math.min(Math.max(0, Math.floor(index)), last)];
}

// MARK: Type

/**
 * Font families as loaded by src/ui/fonts.ts. Each weight is its own family on iOS, so text
 * styles set `fontFamily` and never `fontWeight`.
 */
export const FONTS = {
  soraMedium: 'Sora_500Medium',
  soraSemiBold: 'Sora_600SemiBold',
  soraBold: 'Sora_700Bold',
  manropeRegular: 'Manrope_400Regular',
  manropeMedium: 'Manrope_500Medium',
  manropeSemiBold: 'Manrope_600SemiBold',
  manropeBold: 'Manrope_700Bold',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemiBold: 'JetBrainsMono_600SemiBold',
} as const;

/** Letter-spacing in points for a CSS `em` value (the mockups use -0.02em on headings). */
function em(fontSize: number, value: number): number {
  return Math.round(fontSize * value * 100) / 100;
}

const TABULAR: TextStyle['fontVariant'] = ['tabular-nums'];

/**
 * The type scale. Sora for headings, big numbers and button labels; Manrope for body text and
 * captions; JetBrains Mono for Debug readouts only. Timers and dB use the `*Numeric` styles
 * (tabular numerals). Colours are the usual pairing; override with `color` where needed.
 */
export const TEXT = StyleSheet.create({
  /** Active session's "Dancing". */
  display: { fontFamily: FONTS.soraSemiBold, fontSize: 44, lineHeight: 46, letterSpacing: em(44, -0.03), color: PALETTE.lavender },
  /** Check-in's countdown number. */
  countdown: {
    fontFamily: FONTS.soraSemiBold,
    fontSize: 64,
    lineHeight: 68,
    letterSpacing: em(64, -0.03),
    fontVariant: TABULAR,
    color: PALETTE.text,
  },
  /** "Are you okay?", "Cancelled. Stay safe.", Home's greeting. */
  titleLarge: { fontFamily: FONTS.soraSemiBold, fontSize: 34, lineHeight: 38, letterSpacing: em(34, -0.02), color: PALETTE.text },
  /** Setup, PIN gate, Alert and SOS headings. */
  title: { fontFamily: FONTS.soraSemiBold, fontSize: 28, lineHeight: 32, letterSpacing: em(28, -0.02), color: PALETTE.text },
  /** Debug's heading, the Home wordmark. */
  titleSmall: { fontFamily: FONTS.soraSemiBold, fontSize: 22, lineHeight: 28, letterSpacing: em(22, -0.02), color: PALETTE.text },
  /** Card titles ("Hearing", "Safe PIN"). */
  cardTitle: { fontFamily: FONTS.soraSemiBold, fontSize: 17, lineHeight: 22, color: PALETTE.text },
  /** Big numbers in a MetricTile. */
  metric: { fontFamily: FONTS.soraSemiBold, fontSize: 30, lineHeight: 36, letterSpacing: em(30, -0.02), fontVariant: TABULAR, color: PALETTE.text },
  /** Button labels: regular (60 pt) buttons. */
  button: { fontFamily: FONTS.soraSemiBold, fontSize: 17, lineHeight: 22, color: PALETTE.onLavender },
  /** Button labels: large (72 pt) buttons. */
  buttonLarge: { fontFamily: FONTS.soraSemiBold, fontSize: 20, lineHeight: 26, letterSpacing: em(20, -0.01), color: PALETTE.onLavender },
  /** Button labels: the 96 pt check-in button. */
  buttonHuge: { fontFamily: FONTS.soraSemiBold, fontSize: 24, lineHeight: 30, letterSpacing: em(24, -0.01), color: PALETTE.onLavender },
  /** The second line on a two-line button. */
  buttonCaption: { fontFamily: FONTS.manropeSemiBold, fontSize: 14, lineHeight: 18, color: PALETTE.onLavenderMuted },
  /** Keypad digits. */
  keypadDigit: { fontFamily: FONTS.soraMedium, fontSize: 28, lineHeight: 34, color: PALETTE.text },
  body: { fontFamily: FONTS.manropeRegular, fontSize: 15, lineHeight: 22, color: PALETTE.textMuted },
  bodyStrong: { fontFamily: FONTS.manropeSemiBold, fontSize: 15, lineHeight: 22, color: PALETTE.text },
  /** Field labels and row titles. */
  label: { fontFamily: FONTS.manropeSemiBold, fontSize: 14, lineHeight: 20, color: PALETTE.text },
  labelNumeric: { fontFamily: FONTS.manropeBold, fontSize: 14, lineHeight: 20, fontVariant: TABULAR, color: PALETTE.text },
  caption: { fontFamily: FONTS.manropeRegular, fontSize: 13, lineHeight: 19, color: PALETTE.textMuted },
  captionStrong: { fontFamily: FONTS.manropeBold, fontSize: 13, lineHeight: 19, color: PALETTE.text },
  small: { fontFamily: FONTS.manropeRegular, fontSize: 12, lineHeight: 17, color: PALETTE.textMuted },
  smallStrong: { fontFamily: FONTS.manropeBold, fontSize: 12, lineHeight: 17, color: PALETTE.text },
  /** "STEP 1 OF 4", "RIGHT NOW": uppercase, tracked out. */
  overline: {
    fontFamily: FONTS.manropeSemiBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: em(13, 0.04),
    textTransform: 'uppercase',
    color: PALETTE.textMuted,
  },
  /** Debug readouts. */
  mono: { fontFamily: FONTS.monoSemiBold, fontSize: 18, lineHeight: 24, fontVariant: TABULAR, color: PALETTE.text },
  monoLabel: { fontFamily: FONTS.monoMedium, fontSize: 11, lineHeight: 15, color: PALETTE.textMuted },
  error: { fontFamily: FONTS.manropeSemiBold, fontSize: 13, lineHeight: 19, color: PALETTE.coral },
});

// MARK: Shape and spacing

/** Screen padding before the safe area is applied (see `screenPadding`). */
export const SCREEN_PADDING = { top: 56, sides: 24, bottom: 32 } as const;

/** Gaps between screen sections, cards and rows. */
export const SPACE = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
} as const;

export const RADII = {
  /** Small chips, Avatar squares, the Change button. */
  chip: 10,
  /** Icon chips in rows, icon buttons. */
  iconChip: 12,
  iconButton: 14,
  /** Inputs, segmented controls, tiles, callouts, small cards. */
  field: 16,
  /** Recipient rows. */
  row: 18,
  /** 60 pt buttons. */
  button: 20,
  /** Cards, keypad keys. */
  card: 22,
  /** 72 pt buttons. */
  buttonLarge: 24,
  /** The 96 pt check-in button. */
  buttonHuge: 28,
  /** Fully rounded: any radius over half the height. */
  pill: 500,
} as const;

/** Touch targets, in points. Nothing tappable is smaller than `min`. */
export const TOUCH = {
  min: 44,
  /** Most primary and footer buttons. */
  button: 60,
  /** Secondary buttons ("I'm okay now"). */
  buttonSecondary: 56,
  /** Start session, Call for help, Stop session. */
  buttonLarge: 72,
  /** "I'm okay" on Check-in (and Cancel). */
  checkIn: 96,
  /** PIN keypad keys (the PRD asks for at least 60). */
  keypadKey: 72,
} as const;

/** One ring size for every check-in stage (the mockups drew 240 and 220). */
export const RING = { size: 240, strokeWidth: 12 } as const;

/** SOS's round Call for help button (SOS.html): a 232 pt circle in a 10 pt ring, 44 pt phone icon. */
export const SOS_CALL = { size: 232, ringWidth: 10, iconSize: 44 } as const;

/** Every icon: 24 viewBox, 1.8 stroke, round caps and joins. */
export const ICON = { viewBox: 24, strokeWidth: 1.8, size: 24, sizeSmall: 20, sizeTiny: 18 } as const;

/** How long the wearer holds Stop session (Kean: press-and-hold, 1 s). */
export const HOLD_TO_CONFIRM_MS = 1000;

export interface SafeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * The mockups' 56 / 24 / 32 padding, made to respect the safe area: the mockups don't draw a
 * status bar, so the top is at least the inset plus a small gap.
 */
export function screenPadding(insets: SafeInsets): { paddingTop: number; paddingBottom: number; paddingLeft: number; paddingRight: number } {
  return {
    paddingTop: Math.max(SCREEN_PADDING.top, insets.top + SPACE.sm),
    paddingBottom: Math.max(SCREEN_PADDING.bottom, insets.bottom + SPACE.sm),
    paddingLeft: Math.max(SCREEN_PADDING.sides, insets.left),
    paddingRight: Math.max(SCREEN_PADDING.sides, insets.right),
  };
}
