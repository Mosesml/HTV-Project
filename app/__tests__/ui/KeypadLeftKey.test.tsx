import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Keypad, TOUCH } from '../../src/ui';

// The shared Keypad with the PIN gate's "Submit PIN" in the bottom-left slot (moved here from
// the PIN gate's own keypad when ui/Keypad gained `leftKey`).

type Options = { canSubmit?: boolean; isDisabled?: boolean };

function renderKeypad({ canSubmit = false, isDisabled = false }: Options = {}) {
  const handlers = { onDigit: jest.fn(), onDelete: jest.fn(), onSubmit: jest.fn() };
  render(
    <Keypad
      isDisabled={isDisabled}
      onDigit={handlers.onDigit}
      onDelete={handlers.onDelete}
      leftKey={{ label: 'Submit PIN', icon: 'check', isEnabled: canSubmit, onPress: handlers.onSubmit }}
    />,
  );
  return handlers;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

describe('Keypad with a Submit left key (PIN gate)', () => {
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

  test('Submit sits in the empty slot and is off until it is enabled', () => {
    const { onSubmit } = renderKeypad();
    const submit = screen.getByRole('button', { name: 'Submit PIN' });
    expect(submit).toBeDisabled();
    fireEvent.press(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('Submit calls its onPress once enabled', () => {
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

  test('without a left key the slot stays blank: ten digits and delete only', () => {
    render(<Keypad onDigit={jest.fn()} onDelete={jest.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(11);
    expect(screen.queryByRole('button', { name: 'Submit PIN' })).toBeNull();
  });
});
