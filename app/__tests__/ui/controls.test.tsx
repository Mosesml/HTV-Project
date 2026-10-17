import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Keypad } from '../../src/ui/Keypad';
import { PinDots } from '../../src/ui/PinDots';
import { Segmented } from '../../src/ui/Segmented';
import { TextField } from '../../src/ui/TextField';
import { PALETTE, TOUCH } from '../../src/ui/theme';
import { Toggle } from '../../src/ui/Toggle';

describe('Toggle', () => {
  test('is a labelled switch that flips its value', () => {
    const onValueChange = jest.fn();
    render(<Toggle value={false} onValueChange={onValueChange} accessibilityLabel="Maya: see location" />);
    const toggle = screen.getByRole('switch', { name: 'Maya: see location' });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(toggle);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  test('reaches 44 pt with hitSlop', () => {
    render(<Toggle value onValueChange={() => {}} accessibilityLabel="Theo: full details" />);
    const toggle = screen.getByRole('switch', { name: 'Theo: full details' });
    const { height } = StyleSheet.flatten(toggle.props.style);
    expect(height + toggle.props.hitSlop.top + toggle.props.hitSlop.bottom).toBeGreaterThanOrEqual(TOUCH.min);
  });

  test('locked on: checked, disabled, says "Always on", and ignores taps', () => {
    const onValueChange = jest.fn();
    render(<Toggle value={false} isLocked onValueChange={onValueChange} accessibilityLabel="Maya: get alerts" />);
    const toggle = screen.getByRole('switch', { name: 'Maya: get alerts' });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true, disabled: true });
    expect(toggle.props.accessibilityHint).toBe('Always on');
    expect(StyleSheet.flatten(toggle.props.style).backgroundColor).toBe(PALETTE.toggleLocked);
    fireEvent.press(toggle);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('Segmented', () => {
  const OPTIONS = [
    { value: 80, label: 'Quieter' },
    { value: 85, label: 'Balanced' },
    { value: 90, label: 'Louder' },
  ] as const;

  test('is a radio group; the selected one is checked and filled in its accent', () => {
    const onChange = jest.fn();
    render(<Segmented options={OPTIONS} value={85} onChange={onChange} accent="blue" accessibilityLabel="How loud is okay?" />);
    const balanced = screen.getByRole('radio', { name: 'Balanced' });
    expect(balanced.props.accessibilityState).toMatchObject({ checked: true });
    expect(StyleSheet.flatten(balanced.props.style).backgroundColor).toBe(PALETTE.blue);
    expect(screen.getByRole('radio', { name: 'Quieter' }).props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(screen.getByRole('radio', { name: 'Louder' }));
    expect(onChange).toHaveBeenCalledWith(90);
  });

  test('every segment is at least 44 pt tall', () => {
    render(<Segmented options={OPTIONS} value={80} onChange={() => {}} />);
    screen.getAllByRole('radio').forEach((radio) => expect(StyleSheet.flatten(radio.props.style).minHeight).toBeGreaterThanOrEqual(TOUCH.min));
  });
});

describe('Keypad', () => {
  test('has the ten digits and delete, each a 72 pt button', () => {
    const onDigit = jest.fn();
    const onDelete = jest.fn();
    render(<Keypad onDigit={onDigit} onDelete={onDelete} />);
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach((digit) => fireEvent.press(screen.getByRole('button', { name: digit })));
    expect(onDigit.mock.calls.map(([digit]) => digit)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    fireEvent.press(screen.getByRole('button', { name: 'Delete digit' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(screen.getByRole('button', { name: '5' }).props.style).height).toBe(TOUCH.keypadKey);
  });

  test('disabled keys do nothing', () => {
    const onDigit = jest.fn();
    render(<Keypad isDisabled onDigit={onDigit} onDelete={() => {}} />);
    fireEvent.press(screen.getByRole('button', { name: '1' }));
    expect(onDigit).not.toHaveBeenCalled();
  });
});

describe('PinDots', () => {
  test('shows how many digits are in, never the digits', () => {
    render(<PinDots filled={2} />);
    expect(screen.getByLabelText('2 of 4 digits entered')).toBeTruthy();
    expect(screen.getAllByTestId('pin-dot-filled')).toHaveLength(2);
    expect(screen.getAllByTestId('pin-dot-empty')).toHaveLength(2);
  });

  test('grows past 4 for longer PINs', () => {
    render(<PinDots filled={6} />);
    expect(screen.getByLabelText('6 of 6 digits entered')).toBeTruthy();
  });
});

describe('TextField', () => {
  test('a labelled field with a tag and a helper', () => {
    const onChangeText = jest.fn();
    render(
      <TextField
        label="Meeting spot"
        tag="optional"
        helper="Indoor GPS can be off by a block. This goes in the alert."
        placeholder="e.g. left of the main stage, by the bar"
        value=""
        onChangeText={onChangeText}
      />
    );
    fireEvent.changeText(screen.getByLabelText('Meeting spot'), 'By the bar');
    expect(onChangeText).toHaveBeenCalledWith('By the bar');
    expect(screen.getByText('(optional)', { exact: false })).toBeTruthy();
    expect(screen.getByText('Indoor GPS can be off by a block. This goes in the alert.')).toBeTruthy();
  });

  test('an error replaces the helper and turns the border coral', () => {
    render(<TextField label="Your name" value="" error="Enter your name" helper="Shown in alerts" onChangeText={() => {}} />);
    expect(screen.getByText('Enter your name')).toBeTruthy();
    expect(screen.queryByText('Shown in alerts')).toBeNull();
    expect(StyleSheet.flatten(screen.getByLabelText('Your name').props.style).borderColor).toBe(PALETTE.coral);
  });
});
