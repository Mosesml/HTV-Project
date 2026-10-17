// The stroke icon set, copied from the mockups' inline SVG (docs/design/screens/*.html).
// Every icon sits in a 24 x 24 viewBox and is drawn with a 1.8 stroke and round caps and
// joins (ICON in theme.ts); the mockups mixed 1.8 to 2.4, so this set settles on one stroke.
// `grip` is the one filled icon (the drag handle's dots). Draw them with <Icon name="…" />.

export type IconShape =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; isFilled?: boolean }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx: number };

const path = (d: string): IconShape => ({ kind: 'path', d });
const circle = (cx: number, cy: number, r: number, isFilled = false): IconShape => ({ kind: 'circle', cx, cy, r, isFilled });
const rect = (x: number, y: number, width: number, height: number, rx: number): IconShape => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
  rx,
});

const SHIELD = 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z';
const GRIP_DOT_RADIUS = 1.6;

export const ICONS = {
  /** Start session. */
  shield: [path(SHIELD)],
  /** The RaveGuard mark on Home. */
  shieldCheck: [path(SHIELD), path('M8.5 12l2.5 2.5 4.5-5')],
  /** Settings (Home). */
  sliders: [path('M4 7h10M18 7h2M4 17h4M12 17h8'), circle(16, 7, 2), circle(10, 17, 2)],
  /** AirPods. */
  headphones: [path('M4 15v-3a8 8 0 0116 0v3'), rect(3, 14, 4, 6, 1.5), rect(17, 14, 4, 6, 1.5)],
  /** Check-in interval. */
  clock: [circle(12, 12, 9), path('M12 7v5l3 2')],
  /** Alert chain. */
  people: [
    circle(9, 8, 3.5),
    path('M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5'),
    path('M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .7 3.2 2.4 3.6 5.2'),
  ],
  /** Hearing protection. */
  soundBars: [path('M3 12h1M7 8v8M11 5v14M15 8v8M19 10v4')],
  /** Drag handle (filled dots). */
  grip: [
    circle(9, 6, GRIP_DOT_RADIUS, true),
    circle(15, 6, GRIP_DOT_RADIUS, true),
    circle(9, 12, GRIP_DOT_RADIUS, true),
    circle(15, 12, GRIP_DOT_RADIUS, true),
    circle(9, 18, GRIP_DOT_RADIUS, true),
    circle(15, 18, GRIP_DOT_RADIUS, true),
  ],
  plus: [path('M12 5v14M5 12h14')],
  /** Call for help (dials the teammate in demo mode, never emergency services). */
  phone: [path('M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z')],
  chevronLeft: [path('M15 5l-7 7 7 7')],
  chevronRight: [path('M9 5l7 7-7 7')],
  /** Debug panel. */
  terminal: [rect(3, 4, 18, 16, 2), path('M7 9l3 3-3 3M13 15h4')],
  check: [path('M5 12.5l4.5 4.5L19 7.5')],
  lock: [rect(5, 11, 14, 10, 2), path('M8 11V8a4 4 0 018 0v3')],
  info: [circle(12, 12, 9), path('M12 8v5M12 16v.5')],
  /** Whispering in your AirPods. */
  speaker: [path('M4 10v4h4l5 4V6L8 10H4z'), path('M16.5 9a4 4 0 010 6')],
  /** Louder prompt and vibrating. */
  vibrate: [rect(7, 3, 10, 18, 2.5), path('M3 9v6M21 9v6')],
  warning: [path('M12 4l9 16H3z'), path('M12 10v4M12 17.5v.5')],
  /** Delete digit on the keypad. */
  backspace: [path('M9 5h11v14H9l-6-7z'), path('M12.5 9.5l5 5M17.5 9.5l-5 5')],
  mapPin: [path('M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z'), circle(12, 9.5, 2.5)],
  /** Fire a scenario (Debug). */
  play: [path('M8 5l11 7-11 7z')],
} as const satisfies Record<string, readonly IconShape[]>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
