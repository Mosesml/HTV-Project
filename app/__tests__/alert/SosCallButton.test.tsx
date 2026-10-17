import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SosCallButton } from '../../src/alert/SosCallButton';
import { PALETTE, SOS_CALL, TOUCH } from '../../src/ui';

// SOS's round "Call for help" (docs/design/screens/SOS.html): 232 pt across, coral, with the
// 10 pt SOS ring around it.

function buttonStyle() {
  return StyleSheet.flatten(screen.getByRole('button', { name: 'Call for help' }).props.style);
}

describe('SosCallButton', () => {
  test('is a 232 pt coral circle with the SOS ring, far above the 44 pt minimum', () => {
    render(<SosCallButton onPress={() => {}} />);
    expect(buttonStyle()).toMatchObject({
      width: SOS_CALL.size,
      height: SOS_CALL.size,
      borderRadius: SOS_CALL.size / 2,
      borderWidth: SOS_CALL.ringWidth,
      borderColor: PALETTE.sosBorder,
      backgroundColor: PALETTE.coral,
    });
    expect(SOS_CALL.size).toBe(232);
    expect(SOS_CALL.size).toBeGreaterThan(TOUCH.min);
  });

  test('presses through, and reads its hint', () => {
    const onPress = jest.fn();
    render(<SosCallButton onPress={onPress} accessibilityHint="Rings your teammate" />);
    const button = screen.getByRole('button', { name: 'Call for help' });
    expect(button.props.accessibilityHint).toBe('Rings your teammate');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('when off, it is disabled, dimmed and does nothing', () => {
    const onPress = jest.fn();
    render(<SosCallButton isDisabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Call for help' });
    expect(button).toBeDisabled();
    expect(buttonStyle()).toMatchObject({ backgroundColor: PALETTE.sosSurface });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('the phone icon is decorative', () => {
    render(<SosCallButton onPress={() => {}} />);
    expect(screen.queryByTestId('icon-phone')).toBeNull();
    expect(screen.getByTestId('icon-phone', { includeHiddenElements: true })).toBeTruthy();
  });
});
