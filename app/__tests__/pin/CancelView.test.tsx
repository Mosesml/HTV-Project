import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { CancelView, formatCheckedInTime } from '../../src/pin/CancelView';
import { CANCELLING_MS } from '../../src/pin/cancelSequence';

const AT_0146 = new Date(2026, 9, 17, 1, 46, 30).getTime();

beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
afterAll(() => jest.useRealTimers());
beforeEach(() => jest.setSystemTime(AT_0146));

describe('CancelView', () => {
  test('"Cancelling…" step: a heading, the small ring and nothing to tap', () => {
    render(<CancelView step="cancelling" onDone={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Cancelling…' })).toBeTruthy();
    expect(screen.getByTestId('cancelling-ring', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('"Cancelled" step: the check badge, "Cancelled. Stay safe.", the time and "Back to my session"', () => {
    const onDone = jest.fn();
    render(<CancelView step="cancelled" onDone={onDone} />);
    expect(screen.getByRole('header', { name: 'Cancelled. Stay safe.' })).toBeTruthy();
    expect(screen.getByTestId('icon-check', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Checked in at 01:46')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back to my session' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('the time is when "Cancelling…" appeared, kept through the step change', () => {
    const view = render(<CancelView step="cancelling" onDone={jest.fn()} />);
    // Cross a minute boundary while "Cancelling…" is up: the time must not move.
    act(() => {
      jest.setSystemTime(AT_0146 + 60_000);
      jest.advanceTimersByTime(CANCELLING_MS);
    });
    view.rerender(<CancelView step="cancelled" onDone={jest.fn()} />);
    expect(screen.getByText('Checked in at 01:46')).toBeTruthy();
  });

  test('nothing on either step depends on anything but the step and the time', () => {
    const first = render(<CancelView step="cancelled" onDone={jest.fn()} />).toJSON();
    const second = render(<CancelView step="cancelled" onDone={jest.fn()} />).toJSON();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('formatCheckedInTime', () => {
  test('24-hour HH:MM in local time, as in the mockup', () => {
    expect(formatCheckedInTime(new Date(2026, 0, 1, 1, 46).getTime())).toBe('01:46');
    expect(formatCheckedInTime(new Date(2026, 0, 1, 23, 5).getTime())).toBe('23:05');
    expect(formatCheckedInTime(new Date(2026, 0, 1, 0, 0).getTime())).toBe('00:00');
  });
});
