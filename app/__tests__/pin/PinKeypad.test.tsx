import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PinKeypad } from '../../src/pin/PinKeypad';
import { TOUCH } from '../../src/ui';

function renderKeypad(props: Partial<Parameters<typeof PinKeypad>[0]> = {}) {
  const handlers = { onDigit: jest.fn(), onDelete: jest.fn(), onSubmit: jest.fn() };
  render(<PinKeypad canSubmit={false} {...handlers} {...props} />);
  return handlers;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

describe('PinKeypad', () => {
  test('every digit key is a button named by its digit', () => {
    const { onDigit } = renderKeypad();
    for (const digit of DIGITS) fireEvent.press(screen.getByRole('button', { name: digit }));
    expect(onDigit.mock.calls.map(([digit]) => digit)).toEqual(DIGITS);
  });

  test('delete is "Delete digit"', () => {
    const { onDelete } = renderKeypad();
    fireEvent.press(screen.getByRole('button', { name: 'Delete digit' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test('Submit sits in the empty slot and is off until canSubmit', () => {
    const { onSubmit } = renderKeypad();
    const submit = screen.getByRole('button', { name: 'Submit PIN' });
    expect(submit).toBeDisabled();
    fireEvent.press(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('Submit calls onSubmit once canSubmit is true', () => {
    const { onSubmit } = renderKeypad({ canSubmit: true });
    fireEvent.press(screen.getByRole('button', { name: 'Submit PIN' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('isDisabled turns every key off (while the PIN is being checked)', () => {
    const handlers = renderKeypad({ canSubmit: true, isDisabled: true });
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
      fireEvent.press(button);
    }
    expect(handlers.onDigit).not.toHaveBeenCalled();
    expect(handlers.onDelete).not.toHaveBeenCalled();
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  test('every key is 72 pt tall, well over the 44 pt minimum', () => {
    renderKeypad();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(12);
    for (const button of buttons) {
      expect(StyleSheet.flatten(button.props.style).height).toBe(TOUCH.keypadKey);
    }
  });
});
