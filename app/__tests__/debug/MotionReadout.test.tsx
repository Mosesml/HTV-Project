import { act, render, screen } from '@testing-library/react-native';

import type { MotionEvent } from '../../modules/raveguard-native';
import { MotionReadout } from '../../src/debug/MotionReadout';
import { FONTS, NO_VALUE, PALETTE } from '../../src/ui';
import { nativeMock } from '../../test-utils/nativeMock';

const READING: MotionEvent = { state: 'walking', pitch: 3.04, roll: -12.96, accelG: 0.98, at: 1_000 };

function emit(motion: MotionEvent) {
  act(() => nativeMock().emit('onMotion', motion));
}

function styleOf(text: string): Record<string, unknown> {
  const style = screen.getByText(text).props.style;
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
}

beforeEach(() => nativeMock().reset());

describe('MotionReadout', () => {
  test('says there are no readouts before the first onMotion, with empty tiles', () => {
    render(<MotionReadout />);
    expect(screen.getByText('no readouts yet (start a session)')).toBeTruthy();
    expect(screen.getAllByText(NO_VALUE)).toHaveLength(4);
    expect(screen.getByText('No feed')).toBeTruthy();
    expect(screen.queryByText('10 Hz')).toBeNull();
  });

  test('shows the mockup tiles: pitch, roll, |accel| and state', () => {
    render(<MotionReadout />);
    emit(READING);
    ['Live head motion', 'pitch', 'roll', '|accel|', 'state'].forEach((label) => expect(screen.getByText(label)).toBeTruthy());
    expect(screen.getByText('walking')).toBeTruthy();
    expect(screen.getByText('3.0°')).toBeTruthy();
    expect(screen.getByText('-13.0°')).toBeTruthy();
    expect(screen.getByText('0.98 g')).toBeTruthy();
  });

  test('readouts are JetBrains Mono, the state in lavender', () => {
    render(<MotionReadout />);
    emit(READING);
    expect(styleOf('3.0°').fontFamily).toBe(FONTS.monoSemiBold);
    expect(styleOf('walking').color).toBe(PALETTE.lavender);
  });

  test('shows the 10 Hz feed as live once readouts arrive', () => {
    render(<MotionReadout />);
    emit(READING);
    expect(screen.getByText('10 Hz')).toBeTruthy();
    expect(screen.queryByText('No feed')).toBeNull();
  });

  test('follows the feed live: the newest reading replaces the last', () => {
    render(<MotionReadout />);
    emit(READING);
    emit({ state: 'fallen', pitch: 5, roll: 70, accelG: 3.1, at: 1_100 });
    expect(screen.getByText('fallen')).toBeTruthy();
    expect(screen.getByText('70.0°')).toBeTruthy();
    expect(screen.queryByText('walking')).toBeNull();
  });

  test('counts readouts, so a stalled feed is visible', () => {
    render(<MotionReadout />);
    emit(READING);
    expect(screen.getByText('1 readout')).toBeTruthy();
    emit({ ...READING, at: 1_100 });
    expect(screen.getByText('2 readouts')).toBeTruthy();
  });

  test('VoiceOver reads the readout as one line', () => {
    render(<MotionReadout />);
    emit(READING);
    expect(screen.getByLabelText('Motion: walking · pitch 3.0° · roll -13.0° · 0.98 g')).toBeTruthy();
  });

  test('stops listening when it unmounts', () => {
    const view = render(<MotionReadout />);
    view.unmount();
    expect(() => emit(READING)).not.toThrow();
  });
});
