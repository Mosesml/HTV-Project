import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { CheckInStage } from '../../modules/raveguard-native';
import { CheckInView } from '../../src/checkIn/CheckInView';
import { CHECK_IN_BUTTON_HEIGHT, COLORS, MIN_TAP_TARGET } from '../../src/ui/theme';

const COUNTDOWN = { secondsLeft: 8, fraction: 0.8 };

function renderView(stage: CheckInStage | null, overrides: Partial<Parameters<typeof CheckInView>[0]> = {}) {
  const onCancel = jest.fn();
  const onEnterPin = jest.fn();
  render(
    <CheckInView
      stage={stage}
      countdown={COUNTDOWN}
      error={null}
      onCancel={onCancel}
      onEnterPin={onEnterPin}
      {...overrides}
    />
  );
  return { onCancel, onEnterPin };
}

describe('CheckInView', () => {
  test('asks "Are you okay?" as the screen heading', () => {
    renderView('whisper');
    expect(screen.getByRole('header', { name: 'Are you okay?' })).toBeTruthy();
  });

  test.each([
    ['whisper', 'Step 1 of 3: Whisper'],
    ['loud', 'Step 2 of 3: Loud'],
    ['pinGate', 'Step 3 of 3: PIN gate'],
  ] as const)('shows the %s stage', (stage, title) => {
    renderView(stage);
    expect(screen.getByText(title)).toBeTruthy();
  });

  test('shows the countdown ring with the seconds left', () => {
    renderView('whisper');
    expect(screen.getByRole('progressbar', { name: 'Time left to answer' })).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
  });

  test('leaves the ring out while the stage end is unknown', () => {
    renderView('whisper', { countdown: null });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  test('Cancel is large, full width, hinted for VoiceOver and calls onCancel', () => {
    const { onCancel } = renderView('loud');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const style = StyleSheet.flatten(cancel.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    expect(style.minHeight).toBe(CHECK_IN_BUTTON_HEIGHT);
    expect(style.alignSelf).toBe('stretch');
    expect(cancel.props.accessibilityHint).toBe("Tells RaveGuard you're okay and stops the check-in.");
    fireEvent.press(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('Cancel is the last thing on screen, so it sits under the thumb', () => {
    renderView('whisper');
    const labels = screen.root
      .findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole !== undefined)
      .map((node) => node.props.accessibilityRole);
    expect(labels.at(-1)).toBe('button');
  });

  test('at the PIN gate it offers Enter PIN in place of Cancel', () => {
    const { onCancel, onEnterPin } = renderView('pinGate');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Enter PIN' }));
    expect(onEnterPin).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('keeps Cancel when the stage is not known yet', () => {
    renderView(null);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  test('shows an error as an alert VoiceOver announces', () => {
    renderView('loud', { error: "Cancel didn't go through. Nod, or tap Cancel again." });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Cancel didn't go through. Nod, or tap Cancel again.");
  });

  test('is dark: the background is the night color', () => {
    renderView('whisper');
    const root = screen.getByTestId('check-in-screen');
    expect(root).toHaveStyle({ backgroundColor: COLORS.nightBackground });
  });
});
