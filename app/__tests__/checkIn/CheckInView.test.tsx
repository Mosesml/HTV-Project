import { processColor, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { CheckInStage, CheckInTrigger } from '../../modules/raveguard-native';
import { CheckInView } from '../../src/checkIn/CheckInView';
import { PALETTE, RING, STAGE_COLORS, TOUCH } from '../../src/ui';
import { FALL_TRIGGER } from '../../test-utils/nativeMock';

const COUNTDOWN = { secondsLeft: 8, fraction: 0.8 };
const SCHEDULED: CheckInTrigger = { kind: 'scheduled', reason: 'scheduled check-in', at: 1_800_000_000_000 };
const HIDDEN = { includeHiddenElements: true };

type ViewProps = Parameters<typeof CheckInView>[0];

function renderView(stage: CheckInStage | null, overrides: Partial<ViewProps> = {}) {
  const onCancel = jest.fn();
  const onEnterPin = jest.fn();
  render(
    <CheckInView
      stage={stage}
      countdown={COUNTDOWN}
      trigger={SCHEDULED}
      error={null}
      onCancel={onCancel}
      onEnterPin={onEnterPin}
      {...overrides}
    />
  );
  return { onCancel, onEnterPin };
}

/** How react-native-svg hands a colour to the native view. */
function svgColor(color: string) {
  return { type: 0, payload: processColor(color) };
}

function ringArc() {
  return screen.getByTestId('countdown-ring-svg-arc', HIDDEN);
}

describe('CheckInView', () => {
  test('asks "Are you okay?" as the screen heading', () => {
    renderView('whisper');
    expect(screen.getByRole('header', { name: 'Are you okay?' })).toBeTruthy();
  });

  test.each([
    ['whisper', 'Step 1 of 3: Whisper'],
    ['loud', 'Step 2 of 3: Louder'],
    ['pinGate', 'Step 3 of 3: PIN'],
  ] as const)('the stage bar shows the %s stage', (stage, label) => {
    renderView(stage);
    expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByTestId(`stage-${stage}-active`, HIDDEN)).toBeTruthy();
  });

  describe('whisper', () => {
    test('names the trigger in a label, says it is whispering and gives the nod copy', () => {
      renderView('whisper');
      expect(screen.getByText('Scheduled check-in')).toBeTruthy();
      expect(screen.getByText('Whispering in your AirPods')).toBeTruthy();
      expect(screen.getByText('Nod twice, or tap below.')).toBeTruthy();
      expect(screen.queryByTestId('check-in-trigger-card')).toBeNull();
    });

    test('the ring is lavender', () => {
      renderView('whisper');
      expect(ringArc().props.stroke).toEqual(svgColor(STAGE_COLORS.whisper));
    });

    test('with no trigger the label just says "Check-in"', () => {
      renderView('whisper', { trigger: null });
      expect(screen.getByText('Check-in')).toBeTruthy();
    });
  });

  describe('loud', () => {
    test('shows what started it as a card with the reason', () => {
      renderView('loud', { trigger: FALL_TRIGGER });
      const card = screen.getByTestId('check-in-trigger-card');
      expect(card).toHaveTextContent('Looked like a fall', { exact: false });
      expect(card).toHaveTextContent('Spike 3.1 g, head 70° sideways, still 12 s', { exact: false });
    });

    test('says it is louder and vibrating, and that the PIN comes next', () => {
      renderView('loud', { trigger: FALL_TRIGGER });
      expect(screen.getByText('Louder prompt and vibrating')).toBeTruthy();
      expect(screen.getByText("Nod twice, or tap below. After this you'll need your PIN.")).toBeTruthy();
    });

    test('the ring is amber and the same size as the whisper ring', () => {
      renderView('loud', { trigger: FALL_TRIGGER });
      expect(ringArc().props.stroke).toEqual(svgColor(STAGE_COLORS.loud));
      expect(StyleSheet.flatten(screen.getByTestId('countdown-ring').props.style)).toMatchObject({
        width: RING.size,
        height: RING.size,
      });
    });

    test('no trigger, no card', () => {
      renderView('loud', { trigger: null });
      expect(screen.queryByTestId('check-in-trigger-card')).toBeNull();
    });
  });

  describe('countdown ring', () => {
    test('is one progress bar whose value is "N seconds left"', () => {
      renderView('whisper');
      const ring = screen.getByRole('progressbar', { name: 'Time left to answer' });
      expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 80, text: '8 seconds left' });
      expect(screen.getAllByRole('progressbar')).toHaveLength(1);
      expect(screen.getByText('8')).toBeTruthy();
    });

    test('while the stage end is unknown it stays full with a dash and says so', () => {
      renderView('whisper', { countdown: null });
      const ring = screen.getByRole('progressbar', { name: 'Time left to answer' });
      expect(ring.props.accessibilityValue).toMatchObject({ now: 100, text: 'Waiting for the timer' });
      expect(screen.getByText('—')).toBeTruthy();
    });
  });

  test('"I\'m okay" is the 96 pt full-width button, hinted for VoiceOver, and calls onCancel', () => {
    const { onCancel } = renderView('loud');
    const okay = screen.getByRole('button', { name: "I'm okay" });
    const style = StyleSheet.flatten(okay.props.style);
    expect(style.minHeight).toBe(TOUCH.checkIn);
    expect(style.alignSelf).toBe('stretch');
    expect(screen.getByText('Cancel the check-in')).toBeTruthy();
    expect(okay.props.accessibilityHint).toBe("Cancel the check-in. Tells RaveGuard you're okay, the same as a nod.");
    fireEvent.press(okay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('"I\'m okay" is the last thing on screen, so it sits under the thumb', () => {
    renderView('whisper');
    const roles = screen.root
      .findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole !== undefined)
      .map((node) => node.props.accessibilityRole);
    expect(roles.at(-1)).toBe('button');
  });

  test('at the PIN gate it offers Enter PIN in place of "I\'m okay"', () => {
    const { onCancel, onEnterPin } = renderView('pinGate', { trigger: FALL_TRIGGER });
    expect(screen.queryByRole('button', { name: "I'm okay" })).toBeNull();
    const enterPin = screen.getByRole('button', { name: 'Enter PIN' });
    expect(StyleSheet.flatten(enterPin.props.style).minHeight).toBe(TOUCH.checkIn);
    expect(enterPin.props.accessibilityHint).toBe('Stop the alert. Opens PIN entry.');
    fireEvent.press(enterPin);
    expect(onEnterPin).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('keeps "I\'m okay" when the stage is not known yet', () => {
    renderView(null);
    expect(screen.getByRole('button', { name: "I'm okay" })).toBeTruthy();
    expect(screen.getByLabelText('Check-in')).toBeTruthy();
  });

  test('shows an error as an alert VoiceOver announces', () => {
    renderView('loud', { error: "Cancel didn't go through. Nod twice, or tap I'm okay again." });
    expect(screen.getByRole('alert')).toHaveTextContent("Cancel didn't go through. Nod twice, or tap I'm okay again.");
  });

  test('is dark: the redesign background', () => {
    renderView('whisper');
    expect(screen.getByTestId('check-in-screen')).toHaveStyle({ backgroundColor: PALETTE.bg });
  });
});
