import { render, screen } from '@testing-library/react-native';

import { formatCountdown, PinGateNotice, pinGateNotice, TEXTED_COPY, UNTIMED_COPY } from '../../src/pin/PinGateNotice';
import { PHASES } from '../../test-utils/nativeMock';

const NOW = 1_800_000_000_000;

describe('formatCountdown', () => {
  test('m:ss, as in the mockup', () => {
    expect(formatCountdown(9)).toBe('0:09');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(125)).toBe('2:05');
    expect(formatCountdown(0)).toBe('0:00');
  });
});

describe('pinGateNotice', () => {
  test('the PIN stage with an end: a countdown to the texts', () => {
    const phase = { ...PHASES.pinGate, stageEndsAt: NOW + 9_000 };
    expect(pinGateNotice(phase, NOW - 6_000, NOW)).toEqual({ kind: 'countdown', secondsLeft: 9, totalSeconds: 15, fraction: 0.6 });
  });

  test('a stage start that is unknown: a full bar for the time left', () => {
    const phase = { ...PHASES.pinGate, stageEndsAt: NOW + 9_000 };
    expect(pinGateNotice(phase, null, NOW)).toEqual({ kind: 'countdown', secondsLeft: 9, totalSeconds: 9, fraction: 1 });
  });

  test('the PIN stage without an end, or an earlier stage: no number to show, so no guess', () => {
    expect(pinGateNotice(PHASES.pinGate, NOW, NOW)).toEqual({ kind: 'text', text: UNTIMED_COPY });
    // Check-in's "Enter PIN" can open the gate during Whisper; its end isn't when the texts go.
    expect(pinGateNotice({ ...PHASES.whisper, stageEndsAt: NOW + 30_000 }, NOW, NOW)).toEqual({ kind: 'text', text: UNTIMED_COPY });
  });

  test('from Alert or SOS, after the texts went out: neutral copy', () => {
    expect(pinGateNotice(PHASES.escalated, NOW, NOW)).toEqual({ kind: 'text', text: TEXTED_COPY });
    expect(pinGateNotice(PHASES.sos, NOW, NOW)).toEqual({ kind: 'text', text: TEXTED_COPY });
  });

  test('no check-in open: nothing', () => {
    expect(pinGateNotice(null, null, NOW)).toBeNull();
    expect(pinGateNotice(PHASES.monitoring, NOW, NOW)).toBeNull();
    expect(pinGateNotice(PHASES.idle, NOW, NOW)).toBeNull();
  });

  test('never claims a diagnosis or names an emergency service', () => {
    for (const text of [TEXTED_COPY, UNTIMED_COPY]) {
      expect(text).not.toMatch(/drug|unconscious|emergency|police|ambulance/i);
    }
  });
});

describe('PinGateNotice', () => {
  test('the countdown line and the coral bar read as the mockup', () => {
    render(<PinGateNotice notice={{ kind: 'countdown', secondsLeft: 9, totalSeconds: 15, fraction: 0.6 }} />);
    expect(screen.getByLabelText('Your contacts get a text in 0:09')).toBeTruthy();
    expect(screen.getByText('0:09')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Time to enter your PIN' });
    expect(bar.props.accessibilityValue).toMatchObject({ now: 60, text: '9 of 15 seconds left' });
  });

  test('text notices have no bar', () => {
    render(<PinGateNotice notice={{ kind: 'text', text: TEXTED_COPY }} />);
    expect(screen.getByText(TEXTED_COPY)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  test('null renders nothing', () => {
    const { toJSON } = render(<PinGateNotice notice={null} />);
    expect(toJSON()).toBeNull();
  });
});
