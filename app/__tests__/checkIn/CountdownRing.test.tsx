import { render, screen } from '@testing-library/react-native';

import { CountdownRing } from '../../src/checkIn/CountdownRing';
import { RING_TICKS } from '../../src/checkIn/countdown';

const COLOR = '#60A5FA';

describe('CountdownRing', () => {
  test('lights every tick when the stage has just started', () => {
    render(<CountdownRing fraction={1} secondsLeft={10} color={COLOR} />);
    expect(screen.getAllByTestId('ring-tick-lit')).toHaveLength(RING_TICKS);
    expect(screen.queryAllByTestId('ring-tick-unlit')).toHaveLength(0);
  });

  test('lights the share of ticks that matches the time left', () => {
    render(<CountdownRing fraction={0.25} secondsLeft={3} color={COLOR} />);
    expect(screen.getAllByTestId('ring-tick-lit')).toHaveLength(RING_TICKS / 4);
    expect(screen.getAllByTestId('ring-tick-unlit')).toHaveLength((RING_TICKS * 3) / 4);
  });

  test('lit ticks take the stage color', () => {
    render(<CountdownRing fraction={1} secondsLeft={10} color={COLOR} />);
    const [tick] = screen.getAllByTestId('ring-tick-lit');
    expect(tick).toHaveStyle({ backgroundColor: COLOR });
  });

  test('shows the seconds left in the middle', () => {
    render(<CountdownRing fraction={0.5} secondsLeft={5} color={COLOR} />);
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('seconds')).toBeTruthy();
  });

  test('says "second" for the last one', () => {
    render(<CountdownRing fraction={0.1} secondsLeft={1} color={COLOR} />);
    expect(screen.getByText('second')).toBeTruthy();
  });

  test('VoiceOver reads it as one progress bar with the time left', () => {
    render(<CountdownRing fraction={0.75} secondsLeft={8} color={COLOR} />);
    const ring = screen.getByRole('progressbar', { name: 'Time left to answer' });
    expect(ring.props.accessible).toBe(true);
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 75, text: '8 seconds left' });
  });
});
