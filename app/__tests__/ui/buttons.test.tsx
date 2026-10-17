import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { HoldToConfirmButton } from '../../src/ui/HoldToConfirmButton';
import { IconButton } from '../../src/ui/IconButton';
import { PrimaryButton } from '../../src/ui/PrimaryButton';
import { SecondaryButton } from '../../src/ui/SecondaryButton';
import { PALETTE, TOUCH } from '../../src/ui/theme';

function styleOf(name: string) {
  const button = screen.getByRole('button', { name });
  return StyleSheet.flatten(button.props.style);
}

describe('PrimaryButton', () => {
  test('is a lavender button at least 60 pt tall that calls onPress', () => {
    const onPress = jest.fn();
    render(<PrimaryButton label="Next: who sees what" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Next: who sees what' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(styleOf('Next: who sees what')).toMatchObject({ minHeight: TOUCH.button, backgroundColor: PALETTE.lavender });
  });

  test('coral, 72 pt, with a caption read as the hint', () => {
    render(<PrimaryButton label="Call for help" caption="Demo: calls a teammate" tone="coral" size="large" icon="phone" onPress={() => {}} />);
    const button = screen.getByRole('button', { name: 'Call for help' });
    expect(button.props.accessibilityHint).toBe('Demo: calls a teammate');
    expect(styleOf('Call for help')).toMatchObject({ minHeight: TOUCH.buttonLarge, backgroundColor: PALETTE.coral });
    expect(screen.getByText('Demo: calls a teammate')).toBeTruthy();
  });

  test("the two-line 96 pt check-in button", () => {
    render(<PrimaryButton label="I'm okay" caption="Cancel the check-in" size="huge" onPress={() => {}} />);
    expect(styleOf("I'm okay").minHeight).toBe(TOUCH.checkIn);
    expect(screen.getByText('Cancel the check-in')).toBeTruthy();
  });

  test('a disabled button does nothing and says so', () => {
    const onPress = jest.fn();
    render(<PrimaryButton label="Finish setup" isDisabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Finish setup' });
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('joins the caption and a hint', () => {
    render(<PrimaryButton label="Start session" caption="Only starts when you tap" accessibilityHint="Opens the session" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Start session' }).props.accessibilityHint).toBe(
      'Only starts when you tap. Opens the session'
    );
  });
});

describe('SecondaryButton', () => {
  test('outlined, 56 pt by default', () => {
    const onPress = jest.fn();
    render(<SecondaryButton label="I'm okay now" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: "I'm okay now" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(styleOf("I'm okay now")).toMatchObject({
      minHeight: TOUCH.buttonSecondary,
      borderColor: PALETTE.borderStrong,
      backgroundColor: PALETTE.surface,
    });
  });

  test('the SOS outline', () => {
    render(<SecondaryButton label="I'm okay now" tone="sos" onPress={() => {}} />);
    expect(styleOf("I'm okay now")).toMatchObject({ borderColor: PALETTE.sosBorder, backgroundColor: 'transparent' });
  });
});

describe('IconButton', () => {
  test('is at least 44 pt and labelled', () => {
    const onPress = jest.fn();
    render(<IconButton icon="sliders" accessibilityLabel="Settings" onPress={onPress} size={30} />);
    fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(styleOf('Settings')).toMatchObject({ width: TOUCH.min, height: TOUCH.min });
  });

  test('the 60 pt Back beside a 60 pt Next', () => {
    render(<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={() => {}} size={60} />);
    expect(styleOf('Back')).toMatchObject({ width: 60, height: 60 });
  });
});

describe('HoldToConfirmButton', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  test('confirms after a 1 s hold, not before', () => {
    const onConfirm = jest.fn();
    render(<HoldToConfirmButton label="Stop session" onConfirm={onConfirm} />);
    const button = screen.getByRole('button', { name: 'Stop session' });
    fireEvent(button, 'pressIn');
    act(() => jest.advanceTimersByTime(999));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('letting go early cancels', () => {
    const onConfirm = jest.fn();
    render(<HoldToConfirmButton label="Stop session" onConfirm={onConfirm} />);
    const button = screen.getByRole('button', { name: 'Stop session' });
    fireEvent(button, 'pressIn');
    act(() => jest.advanceTimersByTime(600));
    fireEvent(button, 'pressOut');
    act(() => jest.advanceTimersByTime(2000));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('a tap does nothing', () => {
    const onConfirm = jest.fn();
    render(<HoldToConfirmButton label="Stop session" onConfirm={onConfirm} />);
    fireEvent.press(screen.getByRole('button', { name: 'Stop session' }));
    act(() => jest.advanceTimersByTime(2000));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("VoiceOver's activate confirms straight away, and the hint says how", () => {
    const onConfirm = jest.fn();
    render(<HoldToConfirmButton label="Stop session" onConfirm={onConfirm} />);
    const button = screen.getByRole('button', { name: 'Stop session' });
    expect(button.props.accessibilityHint).toBe('Press and hold for 1 second. With VoiceOver, double-tap.');
    expect(button.props.accessibilityActions).toEqual([{ name: 'activate', label: 'Stop session' }]);
    fireEvent(button, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('disabled: neither a hold nor activate confirms', () => {
    const onConfirm = jest.fn();
    render(<HoldToConfirmButton label="Stop session" isDisabled onConfirm={onConfirm} />);
    const button = screen.getByRole('button', { name: 'Stop session' });
    fireEvent(button, 'pressIn');
    act(() => jest.advanceTimersByTime(2000));
    fireEvent(button, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('takes another hold time', () => {
    const onConfirm = jest.fn();
    render(<HoldToConfirmButton label="Stop session" holdMs={500} onConfirm={onConfirm} />);
    fireEvent(screen.getByRole('button', { name: 'Stop session' }), 'pressIn');
    act(() => jest.advanceTimersByTime(500));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
