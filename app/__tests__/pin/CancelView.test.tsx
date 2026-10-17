import { fireEvent, render, screen } from '@testing-library/react-native';

import { CancelView } from '../../src/pin/CancelView';

describe('CancelView', () => {
  test('"Cancelling…" step: a heading and nothing to tap', () => {
    render(<CancelView step="cancelling" onDone={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Cancelling…' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('"Cancelled" step: "Cancelled. Stay safe." and Done', () => {
    const onDone = jest.fn();
    render(<CancelView step="cancelled" onDone={onDone} />);
    expect(screen.getByRole('header', { name: 'Cancelled. Stay safe.' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
