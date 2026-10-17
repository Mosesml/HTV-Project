import { APP_FONTS } from '../../src/ui/fonts';
import {
  FONTS,
  ICON,
  PALETTE,
  RECIPIENT_COLORS,
  recipientColor,
  RING,
  SCREEN_PADDING,
  screenPadding,
  STAGE_COLORS,
  TEXT,
  TOUCH,
} from '../../src/ui/theme';
import { nodeFs, nodePath } from '../../test-utils/nodeFiles';

// Jest provides __dirname; the app has no @types/node to declare it.
declare const __dirname: string;

const README = nodePath.join(__dirname, '..', '..', '..', 'docs', 'design', 'README.md');

/** The wearer-app token table in docs/design/README.md, read straight from the brief. */
function readmeTokens(): Record<string, string> {
  const text = nodeFs.readFileSync(README, 'utf8');
  const section = text.slice(text.indexOf('### Wearer app (dark)'), text.indexOf('### Contact web pages'));
  return Object.fromEntries(
    [...section.matchAll(/^\| `(\w+)` \| `(#[0-9A-F]{6})` \|/gm)].map(([, name, value]) => [name, value])
  );
}

/** WCAG relative luminance contrast between two #RRGGBB colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme tokens', () => {
  test('every README token is in PALETTE with the README value', () => {
    const tokens = readmeTokens();
    expect(Object.keys(tokens)).toHaveLength(16);
    Object.entries(tokens).forEach(([name, value]) => {
      expect({ name, value: PALETTE[name as keyof typeof PALETTE] }).toEqual({ name, value });
    });
  });

  test('every palette value is a six-digit hex colour', () => {
    Object.values(PALETTE).forEach((value) => expect(value).toMatch(/^#[0-9A-F]{6}$/));
  });

  test('text on the backgrounds is readable (WCAG AA, 4.5:1)', () => {
    const pairs: [string, string][] = [
      [PALETTE.text, PALETTE.bg],
      [PALETTE.textMuted, PALETTE.bg],
      [PALETTE.textFaint, PALETTE.bg],
      [PALETTE.textMuted, PALETTE.surface],
      [PALETTE.onLavender, PALETTE.lavender],
      [PALETTE.onLavender, PALETTE.blue],
      [PALETTE.onLavender, PALETTE.mint],
      [PALETTE.onCoral, PALETTE.coral],
      [PALETTE.onLavenderMuted, PALETTE.lavender],
      [PALETTE.onCoralMuted, PALETTE.coral],
      [PALETTE.coral, PALETTE.coralSoft],
      [PALETTE.amber, PALETTE.amberSoft],
      [PALETTE.sosText, PALETTE.sosBg],
      [PALETTE.sosTextMuted, PALETTE.sosBg],
    ];
    pairs.forEach(([fg, bg]) => expect({ fg, bg, ratio: contrast(fg, bg) >= 4.5 }).toEqual({ fg, bg, ratio: true }));
  });

  test('stage colours follow the ladder: lavender, amber, coral', () => {
    expect(STAGE_COLORS).toEqual({ whisper: PALETTE.lavender, loud: PALETTE.amber, pinGate: PALETTE.coral });
  });

  test('recipients are coloured by position, and everyone from the third on shares the last', () => {
    expect(recipientColor(0)).toEqual(RECIPIENT_COLORS[0]);
    expect(recipientColor(1).background).toBe(PALETTE.blue);
    expect(recipientColor(2)).toEqual(RECIPIENT_COLORS[2]);
    expect(recipientColor(7)).toEqual(RECIPIENT_COLORS[2]);
    expect(recipientColor(-1)).toEqual(RECIPIENT_COLORS[0]);
  });
});

describe('type', () => {
  test('every text style uses a loaded font and sets no fontWeight', () => {
    const loaded = Object.keys(APP_FONTS);
    Object.entries(TEXT).forEach(([name, style]) => {
      expect({ name, family: loaded.includes(style.fontFamily as string) }).toEqual({ name, family: true });
      expect({ name, weight: (style as { fontWeight?: string }).fontWeight }).toEqual({ name, weight: undefined });
    });
  });

  test('Sora, Manrope and JetBrains Mono are all loaded', () => {
    expect(Object.values(FONTS).every((family) => family in APP_FONTS)).toBe(true);
  });

  test('timers and dB use tabular numerals', () => {
    [TEXT.countdown, TEXT.metric, TEXT.labelNumeric, TEXT.mono].forEach((style) =>
      expect(style.fontVariant).toEqual(['tabular-nums'])
    );
  });

  test('headings are 28 to 34 with -0.02em tracking; body text is 15', () => {
    expect(TEXT.title.fontSize).toBe(28);
    expect(TEXT.title.letterSpacing).toBeCloseTo(-0.56);
    expect(TEXT.titleLarge.fontSize).toBe(34);
    expect(TEXT.body.fontSize).toBe(15);
  });
});

describe('shape and spacing', () => {
  test('touch targets: 44 minimum, 96 check-in buttons, 72 keypad keys', () => {
    expect(TOUCH.min).toBe(44);
    expect(TOUCH.checkIn).toBe(96);
    expect(TOUCH.keypadKey).toBe(72);
    Object.values(TOUCH).forEach((size) => expect(size).toBeGreaterThanOrEqual(TOUCH.min));
  });

  test('one ring size for every stage, and icons on a 24 grid with a 1.8 stroke', () => {
    expect(RING).toEqual({ size: 240, strokeWidth: 12 });
    expect(ICON.strokeWidth).toBe(1.8);
  });

  test('screen padding is 56 / 24 / 32 and grows to clear the safe area', () => {
    expect(SCREEN_PADDING).toEqual({ top: 56, sides: 24, bottom: 32 });
    expect(screenPadding({ top: 0, bottom: 0, left: 0, right: 0 })).toEqual({
      paddingTop: 56,
      paddingBottom: 32,
      paddingLeft: 24,
      paddingRight: 24,
    });
    // An iPhone with a Dynamic Island and a home indicator.
    expect(screenPadding({ top: 62, bottom: 34, left: 0, right: 0 })).toEqual({
      paddingTop: 70,
      paddingBottom: 42,
      paddingLeft: 24,
      paddingRight: 24,
    });
  });
});
